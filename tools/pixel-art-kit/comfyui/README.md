# comfyui/ — LOCAL DEPENDENCY: a running ComfyUI server

Requires a **ComfyUI** server reachable at **`COMFYUI_URL`** (default
`http://127.0.0.1:8188`) with the `pixel-batch` deps installed: **waiIllustrious SDXL**, a
**pixel-art LoRA**, and the **BiRefNet** background-removal node. Stdlib `urllib` only — does
not import `common/` (the dirs couple only via the shared `../out/` on disk).

- **`comfy_api.py`** — HTTP client + job runner (`post`/`get`/`view`/`upload_image`/`run_job`) + config.
- **`comfy_graph.py`** — composable node-group builders (`models`/`prompts`/`empty_latent`/
  `img2img_latent`/`sample`/`decode_downscale`/`bg_removal`/`save`). Mix them for new workflows.
- **`comfy_run.py`** — **text2img** driver (`python comfy_run.py [16|32] [subject ...]`).
- **`comfy_img2img.py`** — **hybrid** driver: agent blockout → img2img denoise sweep.

**Output is max fidelity** (full-color 32px, BiRefNet alpha) — there is *no* palette
reduction in the graph, so you can judge the model's best result. Lock a palette afterwards
with `common/quantize.py`. Output → the shared `../out/`.
