# G.E.M.S. Sprite Style Spec

The **normative** art standard for Demo sprites. The kit's [README](README.md) is *descriptive*
(what each tool does + findings); this is *prescriptive* (what a finished sprite must be). The
guiding principle: **consistency is the game-art win, not maximum per-sprite quality** — a coherent
set of "good enough" sprites reads as one game; a mix of brilliant-but-mismatched ones reads as
broken. These rules exist so three different generators (agent / Aseprite / ComfyUI) converge on one
look.

> **Status:** target for a *greenfield* sprite set. The pre-existing Demo sprites (16px) are being
> separated out; this spec governs new art. Verified against a live ComfyUI test (see _Test results_).

---

## The rules (normative)

**1. Resolution — one density.** **32×32 px** is the base cell; the world is **32px-native at 1×**
(1 art-pixel = 1 device-pixel). Larger objects are **multiples of 32** (a 32×64 tree, 64×64 prop);
sub-cell fragments may be 16px. The one inviolable rule: **never mix pixel densities** — every sprite
is authored and drawn at the same art-resolution, so a character's pixels are the same size as the
tile it stands on. (Why 32 and not 16: it's the floor where the ComfyUI pipeline produces usable
output — see _Test results_. A pure agent/Aseprite set could be 16px, but then ComfyUI is out.)

**2. Palette — two classes.**
- **Color art** (characters, props, items, tiles) → **DawnBringer 32** (`pixlib.DB32`). Every opaque
  pixel must be a DB32 color. DB32 is the *required terminal stage* of any ComfyUI output (it forces
  the off-style anime base onto the project look).
- **Tint masks** (icons recolored at runtime via `draw_sprite_ext` blend — hearts, status pips) →
  a **fixed grayscale luminance ramp**, *not* DB32. All tint masks share one ramp with the same step
  count so they read uniformly when tinted.

Routed by folder/suffix (the existing `…T` suffix on `spr_*T` marks the tint variants). A sprite is
one class or the other; the lint checks it against that class's palette.

**3. Look — anime-flavored flat pixel art.**
- **Flat color only**: no dithering, no anti-aliasing, no gradients. Hard pixel edges.
- **Limited ramp**: ~3–4 shades per material (base + 1 shadow + 1 highlight).
- **Outlines**: selective dark outline on **entities/props** (pop them off the ground); **none** on
  **terrain/floor tiles** (an outline breaks autotile seams).
- **One light direction**, fixed across every sprite (top, for top-down).
- The anime influence (from the only local checkpoint) is a *feature*, not a bug — but it must be
  **uniform**: every sprite goes through the same model/LoRA/denoise band/DB32 quantize, or some
  sprites look more anime than others (the real inconsistency).

**4. Transparency** — hard alpha only (0 or 255); no semi-transparent edges (falls out of the AA ban).

**5. Origin** — entities **foot-anchored** (bottom-center, for y-depth sort); items/tiles **centered**.

**6. Animation** — a horizontal **strip** + a **manifest** (`{name, from, to, fps, loop}` per state,
the `hero_states.json` schema). Standard cadence: idle ~2–4 fps, walk ~8, attack ~12.

---

## Production pipeline (how to hit the spec)

All three methods funnel to **DB32**. Pick by intent:

| Need | Method | Notes |
|---|---|---|
| Blockout / icon / programmatic | **agent** (`common/draw.py`) | char-grid → palette; exact, free |
| Clean re-editable source, frame tags | **Aseprite** (`aseprite/`) | hand finish; tileset/sheet export |
| Rich/anime-flavored entity or prop | **ComfyUI hybrid** | see below — the workhorse for 32px |
| Terrain tile | **material → `tileset_dual.py`** | synth the autotile; don't generate it |

**The hybrid (the anime base's only style-safe mode).** The checkpoint is anime SDXL — off-style by
default (soft shading, anime proportions, scenes instead of textures). So **never trust text2img for
final art**; use it as a refinement stage:

```
agent/Aseprite blockout (defines DB32 colors + flat forms)
  → ComfyUI img2img @ low denoise ~0.4–0.6 (adds texture, structure stays anchored)
  → DB32 quantize  (mandatory terminal stage — slams it onto the palette)
```

Low denoise keeps the model's two weaknesses (composition, palette) under the blockout's control; the
DB32 quantize kills the residual anime softness. High denoise hands control back to the off-style base
— avoid for production. (`comfyui/comfy_img2img.py`; lock the palette with `common/quantize.py` →
`pixlib.DB32`.)

---

## Test results (live ComfyUI 0.25.0, anime base + pixel LoRA, 32px → DB32)

Regenerate: `python <scratchpad>/style_gen.py && style_sheet.py` → `out/styletest/style_sheet.png`
(out/ is gitignored — evidence is regenerated, not committed).

- **Characters (entities) — validated, strong.** 32px text2img produced four coherent, legible
  RPG characters (brown hair / blue tunic / boots); the anime flavor read as clean chibi-ish JRPG
  sprites. DB32 quantize flattened the soft shading into the target look without losing identity.
  **This is the case 32px was chosen for, and it holds.**
- **Items — validated.** The hybrid (blockout → img2img → DB32) kept composition (potion stayed a red
  flask, sword vertical, bed top-down) and read cleanly on DB32.
- **Tiles — synthesis validated; material generation is the bottleneck.** `tileset_dual.py` produced a
  seamless dual-grid set (blob render: smooth borders, zero seams). **But** the vanilla anime base
  generated a *scene* — grass with a horizon band / 3D-block perspective / hallucinated objects — not
  a flat top-down texture, so tiling repeated the horizon as stripes. `--heal` made edges seamless but
  can't remove directional content. **Conclusion:** the synth is ready; tile *materials* need either a
  ComfyUI **seamless/tiling node** + tight "flat top-down, no horizon" prompting, or hand/Aseprite
  authoring. Procedural/authored material → synth works today.

**Net:** the 32px + DB32 + anime-hybrid direction is sound for **entities and items now**; **tiles**
work through synthesis but await a seamless-material source.

---

## Tiles in detail (dual-grid)

The engine renders two corner-based autotile modes, and `common/tileset.py` synthesizes **both** from
**one seamless material texture per terrain** — cutting the frames deterministically so they tile
**by construction** (no per-frame edge-matching for diffusion to fail at):

- **`dual`** (`RenderTileMap` autotile `"dual"`, `spr_tiledual`) — 16 tile-sized frames keyed by the
  4 corner cells. Stack per-material passes (water < sand < grass) for free A-over-B transitions.
- **`corner`** (autotile `"corner"`, the quarter / sub-tile method, `spr_tilecorner`) — 13 half-cell
  pieces (fill / outer / edge / inner) assembled 4-per-tile by neighbor; covers all 256 masks from 13
  pieces. Material repeats every half-cell (inherent — pieces are position-shared); rounder borders
  than dual.

Pick `dual` for terrain-to-terrain blending (the stacking trick); `corner` for the most art-efficient
single-terrain edging. Keep **blob47 walls** hand/Aseprite-authored (47-frame edge consistency is not
a diffusion job).

---

## Enforcement (planned)

A spec only holds if it's checked, not read. The kit already enforces palette (`quantize.py`); the
next step is a **lint** that funnels every sprite (any method) through one gate:

1. canvas size ∈ sanctioned set (32, or a 16/32 multiple);
2. class-correct palette — color art ⊆ DB32, tint masks ⊆ the gray ramp (routed by folder/suffix);
3. alpha ∈ {0, 255} (catches anti-aliasing / soft edges).

---

## Open / deferred

- Lock the **tint-mask gray ramp** (sample the existing `spr_*T` masks to fix the step count/values).
- Add the lint above; point `quantize.py`'s `PALETTE` at `pixlib.DB32`.
- ComfyUI **seamless-material helper** (tiling node) so tile materials are flat + seamless without
  `--heal`.
