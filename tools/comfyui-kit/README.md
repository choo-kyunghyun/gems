# comfyui-kit

Robust Python client for a running [ComfyUI](https://github.com/comfyanonymous/ComfyUI) server — the AI-image experiment harness for the art rework's **flat items and textures**. Deliberately scripts over a web GUI: every run is reproducible (seed + final graph recorded), sweepable (`--runs`), and diffable.

**Scope (learned the hard way):**

- **txt2img only.** No img2img, no furniture, no world objects — the angle/lighting problems that once pushed us toward img2img are solved in-engine (`sh_meshlit`, the projection contract). Subjects are flat item art and tileable textures.
- **Model-agnostic.** The scripts carry no model names, prompts, or styles. The workflow file IS the model combination — you author it in the ComfyUI GUI, export it, and hunt the best combination yourself by iterating workflows + seeds.
- **Zero-dependency** stdlib Python (like the sibling kits) — plain HTTP polling, no websocket library.

## Layout

| Path          | Committed? | What                                                               |
| ------------- | ---------- | ------------------------------------------------------------------ |
| `comfylib.py` | yes        | shared HTTP client (config, submit, poll, download, graph helpers) |
| `generate.py` | yes        | queue a workflow with overrides, wait, save images + `run.json`    |
| `probe.py`    | yes        | server stats + installed model/sampler inventory                   |
| `jobs.py`     | yes        | queue view / interrupt / clear / delete                            |
| `workflows/`  | **no**     | your API-format workflow exports (the model combinations)          |
| `out/`        | **no**     | generated images + per-run manifests                               |
| `local/`      | **no**     | machine config: `config.json` → `{"server": "127.0.0.1:8188"}`     |

Server address: `--server host:port` > `local/config.json` > `127.0.0.1:8188`.

## Workflow

1. **Author the combination in the ComfyUI GUI** — checkpoint/LoRA/sampler wiring, any architecture (SD, SDXL, Flux — natural-language models welcome). Export with **Export (API)** (older builds: Settings → Dev mode → _Save (API Format)_) into `workflows/`. GUI-format exports are rejected with a hint.
2. **Probe the server** for what's installed:

   ```sh
   python tools/comfyui-kit/probe.py                 # version, VRAM, models, samplers
   python tools/comfyui-kit/probe.py --node KSampler # one node's input spec
   ```

3. **Generate.** Overrides find their nodes by tracing the graph (sampler → conditioning → text encode; seed/latent inputs by name), so most workflows need no annotation; `--set` covers anything else by node id, exact title, or class_type:

   ```sh
   python tools/comfyui-kit/generate.py workflows/wf.json -p "a flat wrench icon" --runs 4
   python tools/comfyui-kit/generate.py workflows/wf.json -p "..." -n "blurry" --seed 42 --size 512x512
   python tools/comfyui-kit/generate.py workflows/wf.json --set "KSampler.steps=30" --set "6.text=hello"
   python tools/comfyui-kit/generate.py workflows/wf.json -p "..." --dry-run   # verify targeting first
   ```

4. **Compare runs.** Each run lands in `out/<name>/<stamp>-s<seed>/` with the images and `run.json` — server, workflow path, prompt, seed, every override, and the **final submitted graph**. Re-submitting that graph reproduces the image exactly; diffing two `run.json`s shows exactly what changed between a good and a bad result.
5. **Queue control** while iterating:

   ```sh
   python tools/comfyui-kit/jobs.py               # running/pending
   python tools/comfyui-kit/jobs.py --interrupt   # stop the current prompt
   python tools/comfyui-kit/jobs.py --history 10  # recent results
   ```

Import into GameMaker stays out of this kit: picked winners go through the existing deterministic importers (pixel-art-kit `gm-import/` machinery) or a future strip importer — this kit ends at `out/`.

## Notes

- `--dry-run` prints which nodes the prompt/seed/size overrides resolved to (id + title) without submitting — use it once per new workflow.
- Flux-style graphs (no negative conditioning, `BasicGuider`) are handled: `-p` falls back to tracing `conditioning` links; `-n` just warns if there is nothing to set.
- Ctrl-C stops the _client_ only — the server keeps rendering; `jobs.py --interrupt` stops the server side.
- `jobs.py` is not named `queue.py` because that would shadow the Python stdlib `queue` module for anything run from this directory.
