"""Engine for comfyui-kit workflow scripts (stdlib only).

A workflow is a plain Python script (see workflows/) that defines
build(graph, client) -- wiring ComfyUI nodes with the builders in nodes.py --
and calls generate() to run it. This module is the shared substrate those
scripts import: the server client, the graph builder, the interactive review,
and the submit -> poll -> download -> review -> save loop.

    import comfylib as C
    from nodes import *

    def build(g, client):
        model = load_unet(g, "model.safetensors")
        ...
        save_image(g, image, "out")

    if __name__ == "__main__":
        C.generate(build, server="127.0.0.1:8188")

Talks to ComfyUI over its plain HTTP API (completion by polling /history -- no
websocket), so the kit stays zero-dependency like its sibling kits.

Server address: the `server` arg > local/config.json {"server": "host:port"}
> DEFAULT_SERVER. local/ is gitignored (machine-specific).
"""

import inspect
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

KIT_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_DIR = os.path.join(KIT_DIR, "local")
CONFIG_PATH = os.path.join(LOCAL_DIR, "config.json")
DEFAULT_SERVER = "127.0.0.1:8188"


class ComfyError(RuntimeError):
    """Any kit-level failure (unreachable server, rejected workflow, ...)."""


def load_config():
    """local/config.json as a dict, or {} when absent/broken."""
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


# -- graph (API-format node graph) -------------------------------------------


class GraphNode:
    """Handle returned by Graph.node. Index it for an output link: node[1] ->
    ["<id>", 1]. Passed bare as an input, it means output 0."""

    def __init__(self, nid):
        self.id = nid

    def __getitem__(self, slot):
        return [self.id, slot]


class Graph:
    """Accumulates ComfyUI nodes into an API-format graph. node() auto-assigns
    ids; an input value may be a literal, a GraphNode (its output 0), or a
    [id, slot] link (what the nodes.py builders return)."""

    def __init__(self):
        self._nodes = {}

    def node(self, class_type, **inputs):
        nid = str(len(self._nodes) + 1)
        self._nodes[nid] = {"class_type": class_type, "inputs": {
            k: (v[0] if isinstance(v, GraphNode) else v) for k, v in inputs.items()
        }}
        return GraphNode(nid)

    def build(self):
        return self._nodes


# -- server client -----------------------------------------------------------


class Client:
    """Thin wrapper over the ComfyUI HTTP endpoints this kit uses."""

    def __init__(self, server=None, timeout=30):
        cfg = load_config()
        self.server = server or cfg.get("server") or DEFAULT_SERVER
        self.base = "http://" + self.server
        self.timeout = timeout
        self.client_id = uuid.uuid4().hex

    # -- transport -----------------------------------------------------------

    def _request(self, path, data=None, content_type="application/json"):
        req = urllib.request.Request(self.base + path, data=data)
        if data is not None:
            req.add_header("Content-Type", content_type)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            raise ComfyError(f"HTTP {e.code} from {path}: {body[:2000]}") from None
        except urllib.error.URLError as e:
            raise ComfyError(
                f"cannot reach ComfyUI at {self.base} ({e.reason}) -- is the server "
                f"running? Set the address in local/config.json "
                f'({{"server": "host:port"}}) or pass server=.'
            ) from None

    def get_json(self, path):
        return json.loads(self._request(path).decode("utf-8"))

    def post_json(self, path, payload):
        raw = self._request(path, json.dumps(payload).encode("utf-8"))
        return json.loads(raw.decode("utf-8")) if raw.strip() else {}

    def get_bytes(self, path):
        return self._request(path)

    # -- endpoints -----------------------------------------------------------

    def system_stats(self):
        return self.get_json("/system_stats")

    def object_info(self, node_class=None):
        if node_class:
            return self.get_json("/object_info/" + urllib.parse.quote(node_class))
        return self.get_json("/object_info")

    def queue(self):
        return self.get_json("/queue")

    def history(self, prompt_id=None):
        return self.get_json("/history/" + prompt_id if prompt_id else "/history")

    def interrupt(self):
        self._request("/interrupt", b"{}")

    def clear_queue(self):
        self.post_json("/queue", {"clear": True})

    def delete_queued(self, prompt_ids):
        self.post_json("/queue", {"delete": list(prompt_ids)})

    def submit(self, graph):
        """POST a graph (a Graph or an API-format dict); returns the prompt_id."""
        if isinstance(graph, Graph):
            graph = graph.build()
        res = self.post_json("/prompt", {"prompt": graph, "client_id": self.client_id})
        if "prompt_id" not in res:
            raise ComfyError("server accepted the request but returned no prompt_id: "
                             + json.dumps(res)[:2000])
        return res["prompt_id"]

    def upload_image(self, path):
        """Upload a local image to the server's input folder (multipart POST to
        /upload/image) so LoadImage can read it; returns the server-side name.
        Overwrites, so re-running the same source stays reproducible."""
        if not os.path.isfile(path):
            raise ComfyError("input image not found: " + path)
        with open(path, "rb") as f:
            blob = f.read()
        name = os.path.basename(path)
        boundary = "----comfyui" + uuid.uuid4().hex
        body = b"".join([
            f'--{boundary}\r\nContent-Disposition: form-data; name="image"; '
            f'filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n'
            .encode(), blob, b"\r\n",
            f'--{boundary}\r\nContent-Disposition: form-data; name="overwrite"'
            f"\r\n\r\ntrue\r\n".encode(),
            f"--{boundary}--\r\n".encode(),
        ])
        res = json.loads(self._request(
            "/upload/image", body,
            "multipart/form-data; boundary=" + boundary).decode("utf-8"))
        sub = res.get("subfolder") or ""
        return (sub + "/" + res["name"]) if sub else res["name"]

    def queue_position(self, prompt_id):
        """0 = running, N = pending behind N others, None = not queued."""
        q = self.queue()
        for item in q.get("queue_running", []):
            if item[1] == prompt_id:
                return 0
        for i, item in enumerate(q.get("queue_pending", [])):
            if item[1] == prompt_id:
                return i + 1
        return None

    def wait(self, prompt_id, timeout=600, poll=1.0, on_tick=None):
        """Poll /history until the prompt completes; returns the history entry."""
        start = time.time()
        while True:
            entry = self.history(prompt_id).get(prompt_id)
            if entry is not None:
                status = entry.get("status") or {}
                if status.get("status_str") == "error":
                    raise ComfyError("prompt failed on the server:\n"
                                     + _status_errors(status))
                if status.get("completed") or entry.get("outputs"):
                    return entry
            if time.time() - start > timeout:
                raise ComfyError(f"timed out after {timeout}s waiting for "
                                 f"{prompt_id} (still queued/running -- see jobs.py)")
            if on_tick:
                on_tick(time.time() - start, self.queue_position(prompt_id))
            time.sleep(poll)

    def image_bytes(self, img):
        """Download one history-output image dict via /view."""
        return self.get_bytes("/view?" + urllib.parse.urlencode({
            "filename": img["filename"],
            "subfolder": img.get("subfolder", ""),
            "type": img.get("type", "output"),
        }))


def _status_errors(status):
    lines = []
    for msg in status.get("messages", []):
        if isinstance(msg, list) and len(msg) == 2 and isinstance(msg[1], dict):
            d = msg[1]
            if msg[0] == "execution_error":
                lines.append(f"  node {d.get('node_id')} ({d.get('node_type')}): "
                             f"{d.get('exception_message')}")
    return "\n".join(lines) or "  " + json.dumps(status)[:2000]


# -- run ---------------------------------------------------------------------


def _numbered(path, i):
    root, ext = os.path.splitext(path)
    return f"{root}-{i + 1}{ext}"


def generate(build, *, server=None, output=""):
    """Run a workflow: call build(graph, client) to wire it, submit, wait, then
    download + save each image. Returns the saved paths.

    output names ONE fixed local file, OVERWRITTEN each run (a relative name
    resolves next to the workflow script); a batch's extra images get a -2/-3
    suffix. output="" falls back to the server's own (incrementing) filename in
    the script's directory."""
    client = Client(server)
    graph = Graph()
    build(graph, client)
    prompt_id = client.submit(graph)
    print("queued", prompt_id)

    def tick(elapsed, position):
        state = "running" if position == 0 else (
            f"queue {position}" if position else "waiting")
        sys.stdout.write(f"\r  {elapsed:5.0f}s  {state}   ")
        sys.stdout.flush()

    entry = client.wait(prompt_id, on_tick=tick)
    sys.stdout.write("\r" + " " * 42 + "\r")

    script_dir = os.path.dirname(os.path.abspath(inspect.getfile(build)))
    fixed = None
    if output:
        fixed = output if os.path.isabs(output) else os.path.join(script_dir, output)

    images = [img for out in (entry.get("outputs") or {}).values()
              for img in out.get("images", [])]
    saved = []
    for i, img in enumerate(images):
        data = client.image_bytes(img)
        if fixed is not None:
            path = fixed if i == 0 else _numbered(fixed, i)
        else:
            path = os.path.join(script_dir, img["filename"])
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
        print("saved", path)
        saved.append(path)
    return saved
