"""Shared ComfyUI HTTP client for the comfyui-kit scripts (stdlib only).

Talks to a running ComfyUI server over its plain HTTP API. Completion is
detected by polling /history -- deliberately no websocket, so the kit stays
zero-dependency like the sibling kits (pixel-art-kit, audio-kit).

Server address resolution: --server flag > local/config.json {"server":
"host:port"} > DEFAULT_SERVER. local/ is gitignored (machine-specific).
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

KIT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(KIT_DIR, "out")
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


class Client:
    """Thin wrapper over the ComfyUI HTTP endpoints this kit uses."""

    def __init__(self, server=None, timeout=30):
        cfg = load_config()
        self.server = server or cfg.get("server") or DEFAULT_SERVER
        self.base = "http://" + self.server
        self.timeout = timeout
        self.client_id = uuid.uuid4().hex

    # -- transport -----------------------------------------------------------

    def _request(self, path, data=None):
        url = self.base + path
        req = urllib.request.Request(url, data=data)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")
            raise ComfyError(f"HTTP {e.code} from {url}: {body[:2000]}") from None
        except urllib.error.URLError as e:
            raise ComfyError(
                f"cannot reach ComfyUI at {self.base} ({e.reason}) -- is the server "
                f"running? Set the address in local/config.json "
                f'({{"server": "host:port"}}) or pass --server.'
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
        if prompt_id:
            return self.get_json("/history/" + prompt_id)
        return self.get_json("/history")

    def interrupt(self):
        self._request("/interrupt", b"{}")

    def clear_queue(self):
        self.post_json("/queue", {"clear": True})

    def delete_queued(self, prompt_ids):
        self.post_json("/queue", {"delete": list(prompt_ids)})

    def submit(self, graph):
        """POST an API-format graph; returns the prompt_id."""
        res = self.post_json("/prompt", {"prompt": graph, "client_id": self.client_id})
        if "prompt_id" not in res:
            raise ComfyError("server accepted the request but returned no prompt_id: "
                             + json.dumps(res)[:2000])
        return res["prompt_id"]

    def queue_position(self, prompt_id):
        """0 = running, N = pending behind N-1 others, None = not queued."""
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
            elapsed = time.time() - start
            if elapsed > timeout:
                raise ComfyError(f"timed out after {timeout}s waiting for {prompt_id} "
                                 f"(still queued/running -- see jobs.py)")
            if on_tick:
                on_tick(elapsed, self.queue_position(prompt_id))
            time.sleep(poll)

    def download_outputs(self, entry, dest_dir):
        """Save every output image of a history entry into dest_dir; returns paths."""
        os.makedirs(dest_dir, exist_ok=True)
        saved = []
        for node_id, out in (entry.get("outputs") or {}).items():
            for key in ("images", "gifs"):
                for f in out.get(key, []):
                    if "filename" not in f:
                        continue
                    query = urllib.parse.urlencode({
                        "filename": f["filename"],
                        "subfolder": f.get("subfolder", ""),
                        "type": f.get("type", "output"),
                    })
                    data = self.get_bytes("/view?" + query)
                    path = os.path.join(dest_dir, f["filename"])
                    with open(path, "wb") as fh:
                        fh.write(data)
                    saved.append(path)
        return saved


def _status_errors(status):
    lines = []
    for msg in status.get("messages", []):
        # messages are [event, data] pairs; surface execution_error details
        if isinstance(msg, list) and len(msg) == 2 and isinstance(msg[1], dict):
            d = msg[1]
            if msg[0] == "execution_error":
                lines.append(f"  node {d.get('node_id')} ({d.get('node_type')}): "
                             f"{d.get('exception_message')}")
    return "\n".join(lines) or "  " + json.dumps(status)[:2000]


# -- workflow (API-format graph) helpers --------------------------------------


class GraphNode:
    """Handle returned by Graph.add. Index it for an output link: node[0] ->
    ["<id>", 0]. Passing the bare node as an input means its output 0."""

    def __init__(self, nid):
        self.id = nid

    def __getitem__(self, slot):
        return [self.id, slot]


class Graph:
    """Programmatic API-format workflow builder -- the Python alternative to a
    GUI 'Export (API)' file. Node ids are auto-assigned; inputs take literals
    or another node's output (node[slot], or the bare node for slot 0).

        g = Graph()
        ckpt = g.add("CheckpointLoaderSimple", ckpt_name="model.safetensors")
        pos = g.add("CLIPTextEncode", title="Positive", text="...", clip=ckpt[1])

    Node class names + input specs: probe.py --node CLASS."""

    def __init__(self):
        self._nodes = {}
        self._next = 1

    def add(self, class_type, title=None, **inputs):
        nid = str(self._next)
        self._next += 1
        node = {"class_type": class_type, "inputs": {
            k: (v[0] if isinstance(v, GraphNode) else v)
            for k, v in inputs.items()
        }}
        if title:
            node["_meta"] = {"title": title}
        self._nodes[nid] = node
        return GraphNode(nid)

    def build(self):
        return self._nodes


def load_workflow(path):
    """Load a workflow: an API-format JSON export, or a Python script defining
    build() -> graph (a dict or a Graph). Rejects GUI-format exports with a
    hint."""
    if path.endswith(".py"):
        data = _run_workflow_script(path)
    else:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict) and isinstance(data.get("nodes"), list):
            raise ComfyError(
                path + " is a GUI-format export. In ComfyUI use 'Export (API)' "
                "(older builds: Settings > Dev mode, then 'Save (API Format)') "
                "and use that file instead."
            )
    if not isinstance(data, dict) or not data:
        raise ComfyError(path + ": not a workflow graph")
    for nid, node in data.items():
        if not (isinstance(node, dict) and "class_type" in node):
            raise ComfyError(f"{path}: node {nid!r} has no class_type -- "
                             f"not an API-format workflow")
    return data


def _run_workflow_script(path):
    """Execute a .py workflow and return its graph: build()'s return value,
    or a module-level GRAPH. Either may be a dict or a Graph."""
    import runpy
    ns = runpy.run_path(path)
    graph = ns["build"]() if callable(ns.get("build")) else ns.get("GRAPH")
    if isinstance(graph, Graph):
        graph = graph.build()
    if not isinstance(graph, dict):
        raise ComfyError(path + ": expected build() returning the graph "
                         "(a comfylib.Graph or an API-format dict), or a "
                         "module-level GRAPH")
    return graph


def is_link(v):
    """True when an input value is a [node_id, slot] link, not a literal."""
    return (isinstance(v, list) and len(v) == 2
            and isinstance(v[0], (str, int)) and isinstance(v[1], int))


def title(node):
    return (node.get("_meta") or {}).get("title") or ""


def find_by_class(graph, substr):
    """Node ids whose class_type contains substr (case-insensitive)."""
    s = substr.lower()
    return [nid for nid, n in graph.items() if s in n.get("class_type", "").lower()]


def resolve_nodes(graph, key):
    """Node ids matching `key` by id, exact _meta title, or class_type
    (title/class case-insensitive). Ids of all matches -- caller decides
    whether ambiguity is an error."""
    if key in graph:
        return [key]
    k = key.lower()
    hits = [nid for nid, n in graph.items() if title(n).lower() == k]
    if hits:
        return hits
    return [nid for nid, n in graph.items()
            if n.get("class_type", "").lower() == k]


TEXT_KEYS = ("text", "text_g", "text_l")  # CLIPTextEncode / ...SDXL variants


def trace_text_node(graph, link, depth=6):
    """Follow links upstream from `link` to the first node with a literal text
    input (a CLIPTextEncode or variant), passing through guiders/reroutes/
    conditioning combiners. Returns the node id or None."""
    frontier = [link]
    seen = set()
    while frontier and depth > 0:
        nxt = []
        for lk in frontier:
            if not is_link(lk):
                continue
            nid = str(lk[0])
            if nid in seen or nid not in graph:
                continue
            seen.add(nid)
            inputs = graph[nid].get("inputs") or {}
            if any(isinstance(inputs.get(k), str) for k in TEXT_KEYS):
                return nid
            nxt.extend(v for v in inputs.values() if is_link(v))
        frontier = nxt
        depth -= 1
    return None
