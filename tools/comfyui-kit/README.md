# comfyui-kit

A ComfyUI client for the art rework's **flat items and textures** experiments, where **a workflow is a Python script**. Scripts over a web GUI: every run is reproducible (edit constants, re-run), sweepable (`--runs`), and diffable (it's code). Zero-dependency stdlib Python, like the sibling kits (plain HTTP polling, no websocket).

**Scope (learned the hard way):**

- **txt2img and img2img for flat items + textures only.** No furniture, no world objects — the angle/lighting problems that once motivated a complex pipeline are solved in-engine (`sh_meshlit`, the projection contract).
- **Model-agnostic.** The kit carries no model names, prompts, or styles. A workflow script names the model combination; you hunt the best one yourself.

## Layout

| Path                | Committed? | What                                                                   |
| ------------------- | ---------- | ---------------------------------------------------------------------- |
| `comfylib.py`       | yes        | engine: `Client`, `Graph`, `generate()`, interactive review            |
| `nodes.py`          | yes        | node builders (`load_checkpoint`, `ksampler`, `save_image`, …)         |
| `generate.py`       | yes        | CLI runner for a `.py` workflow (`--seed`/`--runs`/`--out`/`--server`) |
| `probe.py`          | yes        | server stats + installed model/sampler inventory                       |
| `jobs.py`           | yes        | queue view / interrupt / clear / delete                                |
| `workflows/`        | **no**     | your workflow scripts + their output images                            |
| `local/config.json` | **no**     | machine config: `{"server": "127.0.0.1:8188"}`                         |

Server address: an explicit `server` arg (or `--server`) > `local/config.json` > `127.0.0.1:8188`.

## A workflow is a script

Each workflow is a Python script that defines `build(graph, client)` — wiring nodes with the builders in `nodes.py` — plus a constants block you edit. `comfylib.generate()` submits it, polls to completion, and (with `REVIEW`) previews each image for a keep/discard before saving.

```python
# workflows/items.py
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import comfylib as C
from nodes import *

SERVER = "127.0.0.1:8188"
CHECKPOINT = "sd_xl_base_1.0.safetensors"
OUTPUT_PATH = ""     # "" = next to this script
REVIEW = True
SEED, STEPS, CFG = 0, 20, 7.0

def build(g, client):
    model, clip, vae = load_checkpoint(g, CHECKPOINT)
    pos = encode_text(g, "a flat wrench icon", clip)
    neg = encode_text(g, "", clip)
    latent = empty_latent(g, 1024, 1024, batch=4)
    samples = ksampler(g, model, pos, neg, latent, SEED, STEPS, CFG,
                       "euler", "normal", 1.0)
    save_image(g, vae_decode(g, samples, vae), "items")

if __name__ == "__main__":
    C.generate(build, server=SERVER, output=OUTPUT_PATH, review=REVIEW)
```

`workflows/testrun.py` (Anima/Qwen txt2img) and `workflows/pixel.py` (img2img pixel-art sprites, with background removal) are the two reference scripts.

### Running

```sh
python workflows/pixel.py                                  # its own constants
python generate.py workflows/testrun.py --seed 42 --runs 4 # sweep, no edit
python generate.py workflows/pixel.py --out ./sprites --no-review
```

Run a script directly for its defaults; the `generate.py` runner overrides `SERVER`/`OUTPUT_PATH`/`REVIEW`/`SEED` without editing the file and sweeps consecutive seeds with `--runs`.

### Building the graph

`nodes.py` builders each take the `Graph` first, register one node, and return its output link(s) — a `[id, slot]` list (or a tuple for multi-output loaders) that you pass as inputs downstream, wiring the graph like the GUI noodles. It's a starter library; for any node class not there, call `g.node("ClassName", **inputs)` directly. Input/output names come from the server:

```sh
python probe.py                 # version, VRAM, installed models, samplers
python probe.py --node KSampler # one node's input spec
```

A GUI graph exported with **Save (API Format)** is the ground truth to transcribe a new node combination from (its `class_type` + `inputs` map straight onto `g.node(...)` calls).

### img2img

`img2img` needs the source image on the server first — `client.upload_image(path)` (multipart POST to `/upload/image`, overwrites) returns the name `load_image(g, name)` reads. `pixel.py` uses this; the sprite's size is the source size × the pixel scale.

## Queue control

```sh
python jobs.py               # running / pending
python jobs.py --interrupt   # stop the current prompt
python jobs.py --history 10  # recent results
```

## Notes

- **Review** opens each finished image in your OS viewer and asks keep/discard before saving; only kept images hit `OUTPUT_PATH`. It's interactive (`input()`), so run from a terminal; `--no-review` (or `REVIEW = False`) saves everything for batch/sweep runs.
- `Client.submit` accepts a `Graph` or a raw API-format dict, so a GUI _Save (API Format)_ export can be run as-is (`C.Client().submit(json.load(open(path)))`) without transcribing.
- Ctrl-C stops the _client_ only — the server keeps rendering; `jobs.py --interrupt` stops the server side.
- Import into GameMaker stays out of this kit: picked winners go through the existing deterministic importers (pixel-art-kit `gm-import/`) or a future strip importer — this kit ends at the saved image.
- `jobs.py` is not named `queue.py` — that would shadow the Python stdlib `queue` module.
