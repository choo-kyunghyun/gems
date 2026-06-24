# comfyui/ — optional ComfyUI path (LOCAL DEPENDENCY: a running server)

Generic, committed ComfyUI **drivers** — the diffusion path of the kit. The code carries **no model
names, prompts, or weights**; those are machine / license / art-style specific and live in a
gitignored **`local/comfy.config.json`** (copy `comfy.config.example.json` → there and fill it in).

Requires a **ComfyUI** server at **`COMFYUI_URL`** (default `http://127.0.0.1:8188`) with the models
your config names: an **SDXL checkpoint**, a **pixel-art LoRA**, and a **BiRefNet** background-removal
node. Stdlib `urllib` only — does not import `common/` (the dirs couple only via the shared `../out/`).

## Why a special LoRA — and the scale contract

Diffusion can't draw true pixel art natively — left alone SDXL renders smooth, anti-aliased shapes,
not a hard pixel grid. The fix is a **pixel-art LoRA trained on art that was upscaled by a fixed
integer factor with nearest-exact** (every art-pixel blown into an N×N block), commonly **8×** or
**16×**. The LoRA learns to paint that blocky structure; the workflow undoes the blow-up to recover
one bitmap pixel per block — so the workflow's scale **must match the LoRA's training factor.**

For an **8× LoRA** making a 16×16 sprite:

1. **Upscale the input 8× nearest-exact** — 16×16 → 128×128.
2. **KSampler** (denoise) at that working size — the LoRA paints clean 8-px blocks.
3. **Downscale 8× nearest-exact** — 128×128 → 16×16, one pixel per block.

A 16× LoRA is the same with 16 (16×16 → 256×256 → 16×16). Use **nearest-exact** on both ends — any
smoothing filter defeats it. The drivers here are wired for **8×** (`comfy_graph.empty_latent`
`scale_by: 8` + `decode_downscale` `down=0.125`; `WORK = 8 × output` in the img2img/anim drivers);
for a different-scale LoRA change those to match. (Use whatever LoRA you prefer — this kit names none.)

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

## Keep outputs SFW (public repo)

Many SDXL anime checkpoints (Illustrious / NoobAI lineage and their merges) can emit NSFW content,
sometimes unintentionally. If you generate from a public repo, keep two safeguards:

- **Outputs stay gitignored.** Generated images go to `../out/` and all local config to `../local/`,
  both gitignored — so generation can't leak into the repo. The real exposure point is *importing* a
  sprite into a tracked asset folder; **review each one first.**
- **Steer SFW.** These models obey booru rating tags — put `general` (or `rating:general`) in the
  positive and `nsfw, sensitive, explicit` in the negative (`comfy.config.example.json` seeds these
  defaults). Final sprites are tiny (16–64 px), so explicit detail isn't resolvable, but still review
  humanoid sprites for pose / composition.
