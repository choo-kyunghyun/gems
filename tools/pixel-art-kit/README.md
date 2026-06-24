# Pixel-Art Kit

A small, **portable** toolkit for generating pixel-art sprites three ways: **agent**
(deterministic Python, zero-dependency), **Aseprite**
(headless Lua), and **ComfyUI** (diffusion) — plus the **hybrid** that chains them. It produces
static icons, animations, and autotile sets as an engine-agnostic **horizontal strip + JSON
manifest** (PNG is the bus).

---

## No built-in style — scan, then ask

This kit carries **no art style, palette, size, or project data of its own.** Before generating
anything for a project:

1. **Scan the target project** for its existing sprite conventions — cell size(s), the palette /
   colors already in use, the output format (strip + manifest vs individual frames vs sheet), file
   naming, directory layout, and any existing style/art doc.
2. **Report what you found and ask the user to confirm or specify** the target — canvas size,
   palette, look (flat / outlined / shaded), output format. If the project has no sprites yet, ask.
3. **Only then generate**, matching the confirmed conventions.

Never assume a palette, a resolution, or a look — derive them from the project and the user.

---

## Layout — separated by dependency

```
pixel-art-kit/
├── common/     no external deps (pure Python stdlib)        → common/README.md
│   ├── pixlib.py       shared lib: PNG/GIF encode+decode, NN compositing, quantize, paths
│   ├── draw.py         static icons
│   ├── animate.py      single-state animation
│   ├── animate2.py     multi-state character + per-frame export
│   ├── quantize.py     remap a PNG/folder to a PROVIDED palette
│   ├── tileset.py      synthesize an autotile set (dual + corner/quarter) from ONE material
│   ├── terrain_materials.py  tileable terrain materials w/ selectable algos (ripple/grain/blades)
│   ├── preview.py      matched previews + a side-by-side compare across methods
│   └── pack.py         assemble a frames folder -> strip + GIFs + filmstrip + manifest
├── aseprite/   LOCAL DEPENDENCY: Aseprite installed          → aseprite/README.md
│   ├── run.py          Python wrapper (presets: draw / anim / states)
│   └── aseprite_*.lua  static / single-state / multi-state(tagged) scripts
├── comfyui/    LOCAL DEPENDENCY: a running ComfyUI server     → comfyui/README.md
│   ├── comfy_api.py    HTTP client + job runner + config() loader
│   ├── comfy_graph.py  composable node-group builders (model names passed in)
│   ├── comfy_run.py    text2img driver
│   ├── comfy_img2img.py hybrid driver (blockout → img2img)
│   ├── comfy_anim.py   coherent animation (refine frames, fixed seed)
│   └── comfy.config.example.json  template → copy to local/comfy.config.json
├── local/      GITIGNORED: machine/license/style-specific data + scratch
│   └── comfy.config.json   YOUR ComfyUI models + prompts + tuning (gitignored)
└── out/        all generated artifacts (gitignored, shared by every script)
```

Only `common/` runs with no install. `aseprite/` and `comfyui/` are **gated by a local dependency**
and isolated in their own dirs (each with a README marking the requirement). The ComfyUI **code** is
committed but **data-free** — the model filenames, prompts, and tuning it needs live in a gitignored
`local/comfy.config.json` (copy `comfyui/comfy.config.example.json` and fill it in). The dirs couple
only through the shared **`out/`** on disk — no cross-dir imports — so a workflow is just "run some
scripts, they pass PNGs via `out/`."

> Engine-specific consumers live **outside** the kit, in `tools/gems-sprites/` — they import the kit
> and write sprites into a particular game project (see _Project bindings_ below).

---

## Which tool when

| | agent | aseprite | comfyui |
|---|---|---|---|
| Exact size / palette control | ✓ | ✓ | ✗ (own palette + downscale fuzz) |
| Deterministic | ✓ | ✓ | ✗ (cherry-pick from a batch) |
| Clean curves (circles) | rasterizer-dependent | ✓ (shape tools) | ✓ |
| Detail / richness | low | low | **high** |
| Small-cell (16px) output | ✓ | ✓ | model-dependent (some pixel LoRAs are crisp, others need ≥32px) |
| Animatable | ✓ (deterministic) | ✓ (frame tags) | only via agent-anchored img2img |
| Setup cost | none (stdlib) | Aseprite (paid) | ComfyUI + models + GPU |

- **agent — prototype.** Deterministic, zero-dependency, exact size/palette, animation-capable.
  Best for blocking out a *consistent placeholder set* fast.
- **ComfyUI — ideate / enrich.** Rich detail, variety in seconds; non-deterministic, its own
  palette, a per-model resolution floor. Best for *exploring a look*, or as the img2img refiner.
- **Aseprite — finish.** Clean shapes, frame tags, tileset/sheet export, re-editable source. Best
  for *promoting* a placeholder to final art.
- **Hybrid — recommended for a specific finished asset:** agent's control + ComfyUI's richness.

**Rule of thumb:** *agent to prototype, ComfyUI to ideate, Aseprite to finish, hybrid to ship a
specific asset.*

---

## Methods in detail

### Agent (programmatic, zero-dependency)
Pixels placed by coordinate via `pixlib`; sprites are char-grids mapped through a palette
(`.` = transparent). **Strengths:** no deps, deterministic, version-controllable, exact
palette/size, animation coherence is *free* (every pixel chosen each frame). **Weakness:**
organic/curved forms are fiddly; detail is capped — fine at small cells where detail is limited.

### Aseprite (headless Lua)
The same scripted-pixel idea through Aseprite's API for its tools + export. **Strengths:** clean
curves via shape tools, indexed-palette discipline, re-editable `.aseprite` source, and the big
one — **native frame tags → sheet + JSON export** and tileset mode. **Weakness:** paid + install;
when *scripted* the art is still your pixel decisions (it adds tooling, not vision).

### ComfyUI (diffusion)
An SDXL checkpoint + a pixel-art LoRA over the HTTP API. The drivers sample at a multiple of the
logical size then downscale (nearest-exact) back to the cell grid; an optional background-removal
node yields alpha. **Strengths:** by far the richest detail, free transparency, instant variety.
**Weaknesses:** non-deterministic (generate a batch, cherry-pick), **prompt drift**, its own palette,
and a **resolution floor that depends on the checkpoint/LoRA** — judge each model (some pixel LoRAs
hold up at 16px, others muddy below ~32px).

> The ComfyUI drivers output **max fidelity** (full-color, no palette node) so you can judge the
> model's best result; palette reduction is the separate `common/quantize.py` step.

---

## Animation

Animation = coherent frames packed into a horizontal **strip** + a **manifest**
(`{name, from, to, fps, loop}` per state).

- **Single-state.** Both agent and Aseprite produce clean, ready-to-slice strips + GIFs; the
  agent's deterministic placement makes frame coherence free.
- **Multi-state + frame tags.** Aseprite's native frame tags → exported sheet + `meta.frameTags`
  JSON (per-frame durations); the agent emits a hand-authored manifest. Tags are the decisive win
  once you have *many* states/characters.
- **Coherent animation via img2img.** Refining agent frames through img2img at a **fixed seed +
  low denoise** keeps the subject identical frame-to-frame (no flicker) while adding detail: the
  agent supplies the coherent motion (diffusion's weakness), img2img supplies the richness.

---

## Hybrid pipeline — recommended for a specific asset

PNG is the bus, so the methods chain — each covering another's weakness:

1. **`common/draw.py`** draws a clean, deterministic blockout (exact size / pose / composition).
2. **`comfyui/comfy_img2img.py`** runs img2img — adds shading/material while *respecting* the
   blockout, which **kills text2img's drift** (the subject keeps its shape, colors, and composition).
3. **`common/quantize.py`** locks the result onto **your** target palette (provide it).
4. **`common/pack.py`** packs frames into a strip + manifest.

**Denoise is the dial:** ~0.45 hugs the blockout (keeps exact layout/view); ~0.85 maximizes detail
while composition still survives; **~0.6 is a balanced default**. For **animation**, use a **fixed
seed across frames** + low denoise (~0.3–0.45).

**Caveats:** img2img wants a resolution the model handles well (per-model floor); it yields one
image per run (add `RepeatLatentBatch` for variety); every handoff needs the quantize +
nearest-exact discipline.

---

## Requirements

- **common/** — Python 3, **stdlib only** (no PIL; PNG encode+decode and the GIF writer are
  hand-rolled in `pixlib.py`).
- **aseprite/** — **Aseprite 1.3+**; set the **`ASEPRITE`** env var to the exe.
- **comfyui/** — a running **ComfyUI** server at **`COMFYUI_URL`** (default `http://127.0.0.1:8188`)
  with the models named in **`local/comfy.config.json`** (an SDXL checkpoint + a pixel-art LoRA + a
  BiRefNet node). The drivers are committed + data-free; copy `comfyui/comfy.config.example.json` →
  `local/comfy.config.json` (gitignored) and fill in your models + prompts.

All generated output goes under **`out/`** (gitignored). Committed content is scripts + docs.

---

## Usage

Set env once (PowerShell): `$env:ASEPRITE = "...\Aseprite.exe"`, `$env:COMFYUI_URL = "http://127.0.0.1:8188"`.

```sh
# agent (no external deps)
python common/draw.py            # static icons -> out/agent/
python common/animate.py         # single-state animation -> out/anim/...
python common/animate2.py        # multi-state character + per-frame export
python common/preview.py agent   # nearest-neighbor previews + compare

# Aseprite (needs Aseprite installed)
python aseprite/run.py draw      # -> out/aseprite
python aseprite/run.py states    # tag a strip -> sheet + frameTags JSON

# ComfyUI (server running; needs local/comfy.config.json — see Requirements)
python comfyui/comfy_run.py 32 <subject ...>           # text2img -> out/comfyui/
python common/draw.py                                  # blockout first
python comfyui/comfy_img2img.py <subject ...>          # hybrid img2img sweep
python common/quantize.py <in_dir> <out_dir> <pal.hex> # lock onto a provided palette
python comfyui/comfy_anim.py <frames_subdir>           # coherent animation (fixed seed)
python common/pack.py <frames> <out> <manifest.json>   # frames -> strip + manifest

# autotile: synthesize a set from ONE material (seamless by construction), both modes
python common/tileset.py <material.png> <cell> --mode dual|corner [--heal]
#   dual_strip16.png   = 16 corner-keyed frames     corner_strip13.png = 13 quarter pieces

# compare methods side by side (matched display size)
python common/preview.py agent comfyui aseprite
```

> `<subject>` names come from your `local/comfy.config.json` `prompts`; `draw.py`'s built-in subjects
> are demo placeholders. Both are data you supply, not baked into the kit.

---

## Conventions

- **Palette-driven (agent)**: sprites are char-grids mapped through a palette; `.` = transparent.
  The palette is **provided per project** — none is baked into the kit.
- **Nearest-exact previews**: `_x16.png` upscales are integer nearest-neighbor on a checker (so
  transparency reads); a common display box matches different cell sizes for fair comparison.
- **Strip + manifest output**: every horizontal strip (animations *and* autotile sets) is named
  **`<base>_strip<N>.png`** — the `_stripN` convention, so engines that read it (e.g. GameMaker)
  auto-slice into N frames. Animations also emit a `{name, from, to, fps, loop}` manifest.
- **Max fidelity vs palette**: the ComfyUI graph does no palette reduction, so you judge the model's
  best output; `quantize.py` is the separate palette-lock step (provide the target palette).

---

## Gotchas

- Aseprite `.lua` must be saved **BOM-free**; paths want **forward slashes**; its stdout is
  unreliable under non-interactive shells — write results to a file and read them back.
- ComfyUI `/prompt` needs the **flattened API graph**; confirm custom-node input names via
  `GET /object_info/<NodeClass>` before submitting (and that model/LoRA filenames match exactly).
- **No PIL** — `pixlib` hand-rolls PNG encode+decode and an uncompressed-LZW animated-GIF writer.
- ComfyUI's viable resolution floor is **model-dependent**; img2img yields **one image per run**
  (`RepeatLatentBatch` for variety).

---

## Project bindings (kept out of the reusable core)

Project- and engine-specific code lives **outside** the kit, in `tools/gems-sprites/` — example
consumers that import the kit (via `common/`) and write sprites into a specific GameMaker project:

- `tools/gems-sprites/entity_sprites.py` — draws this project's entities (DB32, foot-anchored) as
  GameMaker sprites.
- `tools/gems-sprites/terrain_sprites.py` — imports `terrain_materials` + `tileset` and writes
  GameMaker dual-grid terrain sprites.

The kit core is now **palette-agnostic**: `pixlib` carries no palette (`load_palette` reads one from
a file), `quantize.py` takes a palette argument, and `tileset.py` takes an optional `--palette`. The
only built-in pixel *data* left is the demo subjects in `draw.py` and the example terrains in
`terrain_materials.py` — both clearly demos; replace per project.
