# comfyui/ — optional ComfyUI path (LOCAL DEPENDENCY: a running server)

Generic, committed ComfyUI **drivers** — the diffusion path of the kit. The code carries **no model
names, prompts, or weights**; those are machine / license / art-style specific and live in a
gitignored **`local/comfy.config.json`** (copy `comfy.config.example.json` → there and fill it in).

Requires a **ComfyUI** server at **`COMFYUI_URL`** (default `http://127.0.0.1:8188`) with the models
your config names: an **SDXL checkpoint**, a **pixel-art LoRA**, and a **BiRefNet** background-removal
node. Stdlib `urllib` only — does not import `common/` (the dirs couple only via the shared `../out/`).

- **`comfy_api.py`** — HTTP client + job runner (`post`/`get`/`view`/`upload_image`/`run_job`) +
  `config()` (loads `local/comfy.config.json`).
- **`comfy_graph.py`** — composable node-group builders (`models`/`prompts`/`empty_latent`/
  `img2img_latent`/`sample`/`decode_downscale`/`bg_removal`/`save`); model names are **passed in**,
  not baked. Mix them for new workflows.
- **`comfy_run.py`** — **text2img** driver (`python comfy_run.py [16|32] [subject ...]`).
- **`comfy_img2img.py`** — **hybrid** driver: agent blockout → img2img denoise sweep.
- **`comfy_anim.py`** — coherent animation: refine source frames at a fixed seed + low denoise.
- **`comfy.config.example.json`** — the config template (placeholders); copy → `local/comfy.config.json`.

**Output is max fidelity** (full-color, BiRefNet alpha) — no palette reduction in the graph, so you
judge the model's best result. Lock a palette afterwards with `common/quantize.py`. Output → `../out/`.
