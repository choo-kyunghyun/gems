#!/usr/bin/env python3
"""comfy_api — ComfyUI HTTP client + job runner (LOCAL DEPENDENCY: a running server).

Config via env: COMFYUI_URL (default http://127.0.0.1:8188). Stdlib urllib only — does
NOT import the common/ lib (the only coupling between dirs is the shared out/ on disk).
Resolves the toolkit root so comfyui/ writes to the same out/ as common/.
"""
import urllib.request, json, os, time, random

BASE = os.environ.get("COMFYUI_URL", "http://127.0.0.1:8188")
KIT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # toolkit root


def out_dir(*parts):
    d = os.path.join(KIT, "out", *parts)
    os.makedirs(d, exist_ok=True)
    return d


def post(graph):
    data = json.dumps({"prompt": graph}).encode()
    req = urllib.request.Request(BASE + "/prompt", data=data,
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())


def get(path):
    return json.loads(urllib.request.urlopen(BASE + path).read())


def view(filename, subfolder="", typ="output"):
    import urllib.parse
    q = urllib.parse.urlencode({"filename": filename, "subfolder": subfolder, "type": typ})
    return urllib.request.urlopen(BASE + "/view?" + q).read()


def upload_image(path):
    """POST a PNG to the server's input dir; returns the name LoadImage references."""
    name = os.path.basename(path)
    data = open(path, "rb").read()
    b = "----pixkit" + format(random.randint(0, 2**32), "x")
    body = b"".join([
        ("--" + b + "\r\n").encode(),
        (f'Content-Disposition: form-data; name="image"; filename="{name}"\r\n').encode(),
        b"Content-Type: image/png\r\n\r\n", data, b"\r\n",
        ("--" + b + "\r\n").encode(),
        b'Content-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n',
        ("--" + b + "--\r\n").encode(),
    ])
    req = urllib.request.Request(BASE + "/upload/image", data=body,
                                 headers={"Content-Type": "multipart/form-data; boundary=" + b})
    r = json.loads(urllib.request.urlopen(req).read())
    return (r.get("subfolder") + "/" + r["name"]) if r.get("subfolder") else r["name"]


def run_job(graph, save_node="save", timeout=300):
    """Queue a graph, poll /history, return the save node's image descriptors (or [])."""
    resp = post(graph)
    if resp.get("node_errors"):
        print("  NODE ERRORS:", json.dumps(resp["node_errors"])[:1500])
        return []
    pid = resp["prompt_id"]
    t0 = time.time()
    while time.time() - t0 < timeout:
        h = get(f"/history/{pid}")
        if pid in h and h[pid].get("outputs"):
            return h[pid]["outputs"].get(save_node, {}).get("images", [])
        time.sleep(1.5)
    print("  TIMEOUT")
    return []
