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

The gm-import generators emit **16×16**: `entity_sprites.py` draws at 16px (foot-anchored 8,16),
`terrain_sprites.py` follows `terrain_materials.S = 16`, and the `templates/` demos are 16×16 DB32.

The **engine is now 16px-native** too — the RPG runs a 16-world-px cell: `RpgLevel` `RPG_CELL = 16`
+ `cell: 16` in the level JSONs, the follow camera at `zoom: 2` (same cell framing the old 32px world
had at zoom 1), and every world-px gameplay constant halved (player/enemy/prop bboxes, move/bullet
speeds, melee reach, light radii, `CombatAI` aggro/range, interact/NPC radii, companion offsets,
drop/radar/floating-number cosmetics). Sprites stay foot-anchored (origin now 8,16) and draw at
scale 1. (The `Platformer` minigame is unchanged — separate world, debug-box art, not the 16px set.)

The committed `sprites/` are now **16px** too — the 13 entity sprites (`entity_sprites.py`) and the
3 `spr_terrain*` sets (`terrain_materials.py` + `terrain_sprites.py`) were regenerated in place
(deterministic uuids → churn-free re-runs). The migration is complete: regenerate any time by re-running
the generators after editing a template.

**Not covered** (no procedural generator — outside the entity/terrain workflow): the lobby/editor UI
icons `spr_back` / `spr_exit` / `spr_revert` (currently unused) and `spr_choo` / `spr_play` (the
Platformer, which stays 32px debug-box art). Author these by hand or add a template if they ever join
the 16px set.
