---
name: pixel-art-kit
description: >-
  Generate pixel-art game sprites — static icons/props/items, single- and multi-state
  character animations, and autotile/terrain sets — three ways: deterministic zero-dependency
  Python, headless Aseprite, or ComfyUI diffusion, plus a hybrid that chains them. Output is an
  engine-agnostic horizontal strip + JSON manifest (PNG throughout). Use when the user wants to
  create, prototype, refine, or batch 2D pixel sprites or tilesets. The kit carries NO built-in
  art style: scan the target project for its existing conventions and confirm the target style
  with the user before generating.
---

# Pixel-Art Kit

Generate pixel-art sprites, animations, and autotile sets as an engine-agnostic **strip + JSON
manifest** (PNG throughout). Setup, per-script usage, which-tool-when, conventions, and gotchas
all live in **[README.md](README.md)** — read it before running anything.

## No built-in style — scan, then ask (do this first, every time)

This skill has **no art style, palette, size, or project data of its own.** Before generating
anything:

1. **Scan the target project** for its existing sprite conventions — cell size(s), the palette /
   colors in use, the output format (strip + manifest vs individual frames vs sheet), file naming,
   directory layout, and any existing style or art-spec doc.
2. **Report what you found and ask the user to confirm or specify** the target — canvas size,
   palette, look (flat / outlined / shaded), output format. If the project has no sprites yet, ask.
3. **Only then generate**, matching the confirmed conventions.

Never assume a palette, a resolution, or a look — derive them from the project and the user.

## Methods (pick per the README's "which tool when")

**agent** (`common/`, zero-dep) · **Aseprite** (`aseprite/`, local dep) · **ComfyUI**
(`comfyui/`, local dep + GPU; data in gitignored `local/comfy.config.json`) · **hybrid** (agent blockout → ComfyUI img2img →
palette lock → pack). Rule of thumb: agent to prototype, ComfyUI to ideate, Aseprite to finish,
hybrid to ship a specific asset.

## Script index (entry points; details in README)

- `common/pixlib.py` — shared lib (PNG/GIF, NN compositing, quantize, `load_palette`, paths).
- `common/draw.py` — static icons · `animate.py` / `animate2.py` — single- / multi-state animation.
- `common/pack.py` — a frames folder → strip + GIFs + manifest.
- `common/quantize.py` — remap to a **provided** palette file · `tileset.py` — autotile set (dual +
  corner) from one material · `terrain_materials.py` — tileable materials.
- `common/preview.py` — matched previews + compare sheet.
- `aseprite/run.py` (+ `aseprite_*.lua`) — headless Aseprite presets.
- `comfyui/` — ComfyUI drivers (`comfy_api`/`comfy_graph`/`comfy_run`/`comfy_img2img`/`comfy_anim`); committed + data-free, needs `local/comfy.config.json` (gitignored).

> Engine-specific consumers (e.g. `tools/gems-sprites/`) live **outside** the kit — they import it
> and write into a specific project. Not part of the generic core.
