# G.E.M.S. — pixel-art conventions

The project-specific **answer** to the kit's "scan, then ask" (see [README](README.md)). When making
sprites for **G.E.M.S.**, follow these confirmed conventions instead of re-deriving them each time. The
reusable kit stays style-agnostic; this file is G.E.M.S.'s filled-in style.

## Core convention

| | |
|---|---|
| **Cell size** | **16×16** per cell — icons, items, props, characters, tiles. One cell = one sprite frame. |
| **Palette** | **DB32** (DawnBringer 32) — `palettes/db32.hex`, the GEMS color standard. No other palette. |
| **Color style** | Flat color + **one dark outline** around each silhouette; **hard alpha** (no anti-aliasing, no semi-transparent edges). |
| **Entity origin** | **Foot-anchored** (bottom-center, `8,16`) — the engine's `RenderEntity` draws at the entity `Position`, so the sprite stands up from its feet. Items / icons / tiles are centered. |
| **Output** | Horizontal **strip + JSON manifest** — `<base>_strip<N>.png` (GameMaker `_stripN` auto-slice). |
| **GM naming** | `spr_<thing>` — entities `spr_hero` / `spr_bandit` / …; tiles `spr_terrain*`. |

## Authoring (input data)

- **Statics** → `templates/<name>.txt` (16×16 index grid into `palettes/db32.hex`; `.` = transparent)
  or a self-contained `templates/<name>.json`. Render with `python common/draw.py`.
- **Animations** → `templates/anim/<name>/` (numbered `0.txt`, `1.txt`, … + optional `meta.json`) or a
  single `templates/anim/<name>.json` (multi-frame + `states`). Render with `python common/animate.py`.
- Keep motion **bold** — whole-limb swings, body bob, spins. 16px holds readable motion, not subtle
  detail (no blinks / finger work). Typical clips: idle 2f, walk 4f, attack 3f.

## Pipeline

1. **Author** the template(s) at 16×16 DB32 (this doc *is* the scan/ask answer — don't re-ask).
2. **Render** — `draw.py` / `animate.py` → PNG strip + previews + manifest; eyeball in `out/`.
3. **Import** — `gm-import/` writes the GameMaker sprite into `sprites/spr_*/`. Register the resource
   first (IDE or `gm-cli resourcetool`); frame/layer UUIDs are deterministic (uuid5), so re-running is
   churn-free.

## Status / migration

The currently-shipped entity + terrain sprites are **legacy 32px** and are being **replaced with
16×16**. The generators `gm-import/entity_sprites.py` and `terrain_sprites.py` still emit 32px
(`S = 32`) — drop them to 16 as the art is redrawn. The kit demos under `templates/` are already 16×16
DB32, so they're the reference for the new convention.
