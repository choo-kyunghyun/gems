# Pixel-Art Kit

A small, **portable** toolkit for generating pixel-art sprites three ways — **agent**
(deterministic Python), **Aseprite** (headless Lua), and **ComfyUI** (diffusion) — plus the
**hybrid** that chains them. Built for prototyping game sprites (static icons, animations,
multi-state characters) that drop into a GameMaker-style **strip + manifest**.

> Extracted from the G.E.M.S. project; self-contained and copyable into any repo. This README
> is both the usage guide and the writeup of what was learned comparing the methods.

> **Art standard:** [SPRITES.md](SPRITES.md) — the normative Demo style spec (32px-native, DB32,
> anime-flavored flat pixel art, the two sprite classes, the hybrid pipeline) with live test results.

---

## Layout — separated by dependency

```
pixel-art-kit/
├── common/     no external deps (pure Python stdlib)        → common/README.md
│   ├── pixlib.py       shared lib: PNG/GIF encode+decode, NN compositing, quantize, paths
│   ├── draw.py         static 16×16 icons
│   ├── animate.py      single-state animation (coin spin)
│   ├── animate2.py     multi-state character (idle/walk/attack) + per-frame export
│   ├── quantize.py     remap a PNG/folder to a fixed palette (style-match lever)
│   ├── tileset.py      synthesize an autotile set (dual + corner/quarter) from ONE material
│   ├── terrain_materials.py  tileable terrain materials w/ selectable algos (ripple/grain/blades)
│   ├── terrain_sprites.py    import those materials as GameMaker dual-grid sprites (+ variants)
│   ├── preview.py      matched previews + out/compare.png across methods
│   └── pack.py         assemble a frames folder -> strip + GIFs + filmstrip
├── aseprite/   LOCAL DEPENDENCY: Aseprite installed          → aseprite/README.md
│   ├── run.py          Python wrapper (presets: draw / anim / states)
│   └── aseprite_*.lua  static / single-state / multi-state(tagged) scripts
├── comfyui/    LOCAL DEPENDENCY: a running ComfyUI server     → comfyui/README.md
│   ├── comfy_api.py    HTTP client + job runner
│   ├── comfy_graph.py  composable node-group builders
│   ├── comfy_run.py    text2img driver
│   ├── comfy_img2img.py hybrid driver (blockout → img2img)
│   └── comfy_anim.py   coherent animation (refine agent frames, fixed seed)
└── out/        all generated artifacts (gitignored, shared by every script)
```

Only `common/` runs with no install. `aseprite/` and `comfyui/` are **gated by a local
dependency** and isolated in their own dirs (each with a README marking the requirement). The
three dirs couple only through the shared **`out/`** on disk — no cross-dir imports — so a
workflow is just "run some scripts, they pass PNGs via `out/`."

---

## Which tool when

| | agent | aseprite | comfyui |
|---|---|---|---|
| Reliable at 16×16 | ✓ | ✓ | only chunky/round subjects |
| Exact palette control | ✓ | ✓ | ✗ (own palette + downscale fuzz) |
| Deterministic | ✓ | ✓ | ✗ (cherry-pick from a batch) |
| Clean curves (circles) | rasterizer-dependent | ✓ (shape tools) | ✓ |
| Detail / richness | low | low | **high** |
| Native output size | 16×16 | 16×16 | **32px floor** (16px degrades) |
| Animatable | ✓ (deterministic) | ✓ (frame tags) | only via agent-anchored img2img |
| Setup cost | none (stdlib) | Aseprite (paid) | ComfyUI + models + GPU |

- **agent — prototype.** Deterministic, zero-dependency, exact size/palette, animation-capable.
  Best for blocking out a *consistent placeholder set* fast. (Quality is "programmer art" — fine
  for placeholders.)
- **ComfyUI — ideate / enrich.** Rich detail, variety in seconds; non-deterministic, 32px floor,
  its own palette. Best for *exploring a look*, or as the img2img refiner in the hybrid.
- **Aseprite — finish.** Clean shapes, frame tags, tileset/sheet export, re-editable source. Best
  for *promoting* a placeholder to final art.
- **Hybrid — recommended for specific assets** (see below): agent's control + ComfyUI's richness.

**Rule of thumb:** *agent to prototype, ComfyUI to ideate, Aseprite to finish, hybrid to ship a
specific asset.*

---

## Methods in detail

### Agent (programmatic, zero-dependency)
Pixels placed by coordinate via `pixlib`; sprites are char-grids mapped through a palette
(`.` = transparent). **Strengths:** no deps, deterministic, version-controllable, exact
palette/size, animation coherence is *free* (every pixel chosen each frame). **Weakness:**
organic/curved forms are fiddly (the coin came out lumpy); detail is capped — fine at 16px where
detail is limited anyway.

### Aseprite (headless Lua)
Same scripted-pixel idea through Aseprite's API for its tools + export. **Strengths:** clean
curves via shape tools (ellipse/line), indexed-palette discipline, re-editable `.aseprite`
source, and the big one — **native frame tags → sheet + JSON export** and tileset mode.
**Weakness:** paid + install; when *scripted* the art is still your pixel decisions (it adds
tooling, not vision). **Finding:** for static icons, scripted-Aseprite ≈ agent except a cleaner
coin circle.

### ComfyUI (`pixel-batch`, diffusion)
SDXL + a pixel-art LoRA over the HTTP API. Pipeline: logical-size empty latent → **LatentUpscaleBy
8×** (so it samples at 8× the logical size) → KSampler (euler_ancestral, 30 steps, cfg 7) →
VAEDecode → **ImageScaleBy 0.125** (back to logical size) → **BiRefNet** bg removal (→ alpha).
**Strengths:** by far the richest detail, free transparency, instant variety. **Weaknesses:**
non-deterministic (generate a batch, cherry-pick), **prompt drift** (a "red potion" came out
green, "single coin" → stacks, "top-down bed" → a blob/pumpkin), its own palette, and a **32px
floor** — at 16px (sampling 128px) chunky/round subjects limp through muddily and thin/structured
ones fail.

> The kit's ComfyUI drivers output **max fidelity** (full-color, no palette node) so you can judge
> the model's best result; palette reduction is the separate `common/quantize.py` step.

---

## Animation

Animation = coherent frames packed into a horizontal **strip** (a GameMaker sprite's subimages)
+ a **manifest** (`{name, from, to, fps, loop}` per state) → an `Animator` graph.

- **Single-state (coin spin).** Both agent and Aseprite produce clean, GameMaker-ready strips +
  GIFs. For simple loops they're **equivalent** — the agent's deterministic placement makes
  frame coherence free.
- **Multi-state + frame tags (hero idle/walk/attack).** The *art* is shared (Aseprite imports the
  agent strip), which isolates the real difference: **Aseprite's native frame tags → exported
  sheet + `meta.frameTags` JSON** (with per-frame durations). The agent emits a hand-authored
  manifest instead. Both feed an `Animator` graph; tags are the decisive win once you have *many*
  states/characters.
- **Coherent animation via img2img — works.** Refining the agent hero's frames through img2img at
  a **fixed seed + low denoise** (`comfy_anim.py` → `pack.py`) keeps the character identical
  frame-to-frame (no flicker) while adding detail. The agent supplies the coherent motion
  (diffusion's weakness); img2img supplies the richness. Verified on the walk cycle at d0.30/d0.45.

---

## Resolution — 16×16 vs 32×32 for entities

At matched on-screen size, a 32px refined character carries visibly more detail (face, shading)
than a chunky 16px one, and the coherent-animation test shows **32px is reachable without losing
animation coherence** (author motion in the agent, refine via img2img at a fixed seed).

**Recommendation:** **entities 32×32; items / tiles / icons 16×16.** Entities are where detail
matters (limbs, weapons, future directional sheets) and where you generate the most; items stay
fine at 16px. (In G.E.M.S. the existing entities are 16×16 drawn at `xscale 2` = 32px on screen,
and collision is bbox-based, so a sprite-size change is a cheap, low-risk visual swap.) Diffusion
also wants ≥32px, so 32px entities fit the hybrid pipeline naturally.

---

## Hybrid pipeline (min-max) — recommended for specific assets

PNG is the bus, so the methods chain — each covering another's weakness:

1. **`common/draw.py`** draws a clean, deterministic blockout (exact size / pose / composition).
2. **`comfyui/comfy_img2img.py`** runs img2img (`LoadImage → ImageScale 256 → VAEEncode →
   KSampler@denoise → decode → ×0.125 → BiRefNet`) — adds shading/material while *respecting* the
   blockout, which **kills text2img's drift** (the potion stayed red, the bed stayed a top-down
   bed instead of a blob, a single coin instead of a stack, the sword vertical).
3. **`common/quantize.py`** locks the result to your palette (nearest RGB; holds shape/detail with
   only subtle shifts, so a generated sprite sits in the existing set).
4. **agent / `pack.py`** packs frames into a strip + manifest.

**Denoise is the dial:** ~0.45 hugs the blockout (keeps exact layout/view, but a 16px blockout
upscaled can look muddy); ~0.85 maximizes detail while composition still survives; **~0.6 is a
balanced default**. Low to *preserve layout*, high to *maximize detail*.

For **animation**, use a **fixed seed across frames** + low denoise (~0.30–0.45): the agent's
coherent skeleton + the constant seed give jitter-free, richer frames at 32px.

**Caveats:** img2img wants ≥32px; a 16px blockout needs higher denoise to clean up; it yields one
image per run (the latent batch comes from the single input — add `RepeatLatentBatch` for variety);
and every handoff needs the quantize + nearest-exact discipline.

---

## Requirements

- **common/** — Python 3, **stdlib only** (no PIL; PNG encode+decode and the animated-GIF writer
  are hand-rolled in `pixlib.py`).
- **aseprite/** — **Aseprite 1.3+**; set the **`ASEPRITE`** env var to the exe.
- **comfyui/** — a running **ComfyUI** server at **`COMFYUI_URL`** (default
  `http://127.0.0.1:8188`) with: waiIllustrious SDXL + a pixel-art LoRA + the BiRefNet
  background-removal node.

All generated output goes under **`out/`** (gitignored). Committed content is scripts + docs.

---

## Usage

Set env once (PowerShell):

```powershell
$env:ASEPRITE    = "C:\path\to\Aseprite.exe"   # e.g. ...\steamapps\common\Aseprite\Aseprite.exe
$env:COMFYUI_URL = "http://127.0.0.1:8188"
```

**agent** (no external deps):

```sh
python common/draw.py            # out/agent/{potion,coin,sword,bed}.png + previews + sheet
python common/animate.py         # out/anim/agent/coin_{strip8.png, spin.gif, filmstrip.png}
python common/animate2.py        # out/anim/agent_hero/{hero_strip9.png, idle|walk|attack.gif, frames/, hero_states.json}
python common/preview.py agent   # nearest-neighbor previews + out/compare.png
```

**Aseprite** (via the wrapper; needs Aseprite installed):

```sh
python aseprite/run.py draw      # -> out/aseprite
python aseprite/run.py anim      # -> out/anim/aseprite
python aseprite/run.py states    # tag the agent hero strip -> out/anim/aseprite_hero
```

**ComfyUI** (server running) — output is **max fidelity** (full-color 32px):

```sh
python comfyui/comfy_run.py 32 potion coin sword bed   # text2img -> out/comfyui/  (+ _batch/)
python comfyui/comfy_run.py 16 potion coin sword bed   # text2img -> out/comfyui16/

# hybrid: agent blockout -> img2img denoise sweep (needs out/agent/ from draw.py first)
python common/draw.py
python comfyui/comfy_img2img.py coin bed               # -> out/hybrid_d45|d65|d85/<subject>.png
python common/quantize.py out/hybrid_d85 out/hybrid_d85_gems   # lock to the project palette

# coherent animation: refine agent hero frames (fixed seed) -> 32px, then pack to strip+GIFs
python common/animate2.py                              # emits out/anim/agent_hero/frames/
python comfyui/comfy_anim.py                           # -> out/anim/hybrid_hero_d30|d45/ (32px)
python common/pack.py anim/hybrid_hero_d45 anim/hybrid_hero_d45 out/anim/agent_hero/hero_states.json

# autotile: synthesize a tile set from ONE material (seamless by construction), both engine modes
python common/tileset.py                               # procedural grass, both modes -> out/tiles/grass/
python common/tileset.py styletest/grass.png 32 --mode corner --heal   # quarter-tile, real material
#   dual_strip16.png   = 16 tile-frames     (import with RenderTileMap autotile:"dual")
#   corner_strip13.png = 13 quarter pieces  (import with RenderTileMap autotile:"corner")
#   seamless_<mode>.png = a demo blob rendered through the tiles (verify it tiles)

# terrain tiles (the G.E.M.S. overworld pipeline): per-material algorithm -> GameMaker sprites
python common/terrain_materials.py    # out/materials/<t>_<i>.png (water=ripple, sand=grain, grass=blades)
python common/terrain_sprites.py      # cut dual-grid frames + variants -> sprites/spr_terrain{Water,Sand,Grass}
#   the sprite resources must exist first (resourcetool RESOURCE CREATE TYPE=Sprite NAME=spr_terrain<T>);
#   this fills their frames. TerrainStream reads the frame count for the per-cell variant pick.
#   Materials + frame UUIDs are deterministic, so re-running reproduces the committed sprites.
```

**Compare** any set of methods side by side (matched display size for 16px vs 32px):

```sh
python common/preview.py agent comfyui aseprite hybrid_d65   # -> out/compare.png
```

---

## Conventions

- **Palette-driven**: agent sprites are char-grids mapped through a palette; `.` = transparent.
- **Nearest-exact previews**: `_x16.png` upscales are integer nearest-neighbor on a checker (so
  transparency reads); a common 192px display box matches 16px and 32px sprites on screen for fair
  comparison.
- **GameMaker-ready output**: every horizontal strip (animations *and* autotile sets) is named
  **`<base>_strip<N>.png`** — GameMaker's `_stripN` convention, so dragging it in auto-slices into
  N frames (e.g. `coin_strip8`, `hero_strip9`, `dual_strip16`, `corner_strip13`). Animations also
  emit a **manifest** (`{name, from, to, fps, loop}` per state); Aseprite's equivalent is the
  exported sheet + `meta.frameTags` JSON.
- **Max fidelity vs palette**: the ComfyUI graph does no palette reduction, so you judge the
  model's best output; `quantize.py` is the separate palette-lock step. The Demo's palette is
  **DB32** (`pixlib.DB32`); with an anime-base checkpoint the DB32 quantize is effectively a
  *required* terminal stage (it forces the off-style model onto the project look).

---

## Gotchas (recorded from building this)

- Aseprite `.lua` must be saved **BOM-free**; paths want **forward slashes**; its stdout is
  unreliable under non-interactive shells — write results to a file and read them back.
- ComfyUI `/prompt` needs the **flattened API graph** (subgraphs expanded to their nodes); confirm
  custom-node input names via `GET /object_info/<NodeClass>` before submitting.
- **No PIL** — `pixlib` hand-rolls PNG encode+decode and an uncompressed-LZW animated-GIF writer.
- ComfyUI's viable floor is **32px**; **16px degrades** (chunky/round survive, thin/structured
  fail). img2img yields **one image per run** (`RepeatLatentBatch` for variety).
- Reference machine: ComfyUI 0.25.0, RTX 4070 Ti (12GB); ~7–10s per batch of 6 at 256px.

## Untested / follow-ups

- Point `quantize.py`'s `PALETTE` at **`pixlib.DB32`** (the confirmed Demo palette) and add a
  **dual-class lint** (color art → DB32; grayscale tint-masks → a separate luminance ramp).
- **Autotile synthesis** is done for both engine corner modes (`tileset.py`: material → `dual`
  16-frame **and** `corner` 13-piece quarter-tile sets, seamless by construction, corner verified
  against `RenderTileMap`'s own selectors). Still open: **blob47 walls** (47-frame edge consistency
  — hand/Aseprite-authored or built algorithmically; not a diffusion job) and a tileable-material
  ComfyUI helper (seamless texture node, so `tileset.py` rarely needs `--heal`).
- Wire a refined strip + manifest into the engine's `Animator` graph.
