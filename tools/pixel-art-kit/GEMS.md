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
| **GM naming** | `spr_<family>_<subject>[_<variant>]`, snake_case (rule in CLAUDE.md → Code Style): `spr_item_<item_id>` icons, `spr_wear_<garment>` overlays, `spr_tex_<material>` textures, `spr_terrain_<material>` tilesets; a **bare subject** (`spr_human`, `spr_rat`) is reserved for entity strips. |

## Frame size (per-sprite, non-square OK)

Cell size is the *world grid* unit, **not** a sprite-size cap. A sprite's frame can be any **W×H** — the
engine draws it at the entity `Position` by the sprite's **origin**, and the entity's collision is its own
`BBox` component (independent of the sprite), so a taller/wider sprite needs no gameplay change. Use this
for art whose natural shape isn't square: a **tall biped** (32×64) or a **wide weapon/prop** (48×32 …
96×32). The default is square (32px entities / 16px icons); declare a size only where the topology wants it.

**Anchor** (by name convention, matching the two emitters): entities are **foot-anchored** (origin
bottom-center, `w//2, h`) — a taller sprite extends *upward* from the same foot point. `spr_item_*` icons
are **centered** (`w//2, h//2`).

**Determining the ratio — measure, don't guess.** Run `python common/spritesize.py <candidate.png>`: it
trims the subject's alpha bbox, adds margin, and snaps each dimension up to the size menu
(`16,32,48,64,80,96,128` — multiples of the 16px half-unit), printing a catalog-ready entry. This yields
1:2 for a standing biped, ~1.5:1 for a pistol, ~3:1 for a long rifle, etc. Recommended ratios:

| Subject | Anchor | W×H |
|---|---|---|
| Humanoid / NPC | foot | 32×64 (1:2) |
| Small critter, slime | foot | 32×32 |
| Tall prop (torch, doorway) | foot | 32×48 / 32×64 |
| Compact item (potion, gem, mod) | center | 32×32 |
| Pistol / SMG | center | 48×32 (1.5:1) |
| Rifle / shotgun | center | 64×32 (2:1) |
| Sniper / long rifle | center | 96×32 (3:1) |

**Declaring the size — one place per sprite:**

- **AI-imported sprites** (the live path, `local/comfyui/`): add the entry to **`gm-import/sprite_catalog.py`**
  (`"spr_hero": (32, 64)`). `import_hero` / `batch_import` / `import_items` read `size_of(name)` and thread it
  through `framing.frame_file` (frames the candidate at the size without squishing — subject keeps its aspect,
  bottom/center-aligned), `poses` (derives anim frames at the size), and `build`. Declared **once**.
  *(The generation side still renders a square latent; a true tall AI sprite also wants a taller latent in the
  ComfyUI workflow — the one remaining manual step on the AI path.)*
- **Hand-drawn sprites**: declare inline in the generator's `SPRITES` table. Entities (`flat_sprites.py`):
  build the frame at the size — `frame(drawfn, w, h)` — and list `"spr_soldier": (soldier(), 8.0, 32, 64)`.
  Icons (`item_sprites.py`): draw on `blank(w, h)` and list `"spr_item_x": (big_gun(), 64, 32)`. Omit for square.

**Item icons in UI slots** render **aspect-fit** (centered, preserving shape) in `UISlots` — a wide gun icon
no longer gets squished into the square cell; square icons are unaffected.

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
4. **Declare** — an importer also emits its sheets' **`SpriteMeta` manifest**
   (`datafiles/spritemeta/<name>.json` — kind / density / cell per sheet, plus a tileset's
   weighted `variants` table, loaded by the engine's `SpriteMeta` registry at boot). Generated
   alongside the art so declarations can't drift from it; the included file is registered in
   `gems.yyp` once, re-runs only rewrite content. Today `human_sprites.py` emits `human.json`
   and `terrain_sprites.py` `terrain.json` (its variant weights come from
   `terrain_materials.variant_plan` — plain re-rolls heavy, decorated frames light); new
   importers follow the same shape.

## Status / migration

The entity generators emit **16×16** (`entity_sprites.py` draws at 16px, foot-anchored 8,16, and
the `templates/` demos are 16×16 DB32); the **terrain pipeline emits 32×32** since the 2026-07-12
regen (`terrain_materials.S = 32`, 1:1 with the world cell — the hand-shaped stamps scale by
`K = S // 16` so blades/blooms/pebbles keep their 16px-era world size, just crisper).

⚠️ **The engine is not 16px-native** — since the 2026-07 migration the RPG runs a
**32-world-px cell** (`RpgLevel` `RPG_CELL = 32` + `cell: 32` in the level JSONs; the 2026-07 media
set — vox meshes, `spr_tex_*` wall/floor textures — authors 1:1 at 32 px/cell). The kit's remaining
16px sheets still work: tiles are UV-stretched over the cell, and 16px entity sprites draw at a
×2 scale (declare `SpriteMeta density: 0.5`, as the fence does). (The `Platformer` minigame is
unchanged — separate world, debug-box art, not the 16px set.)

The committed `spr_terrain*` sets (`terrain_materials.py` + `terrain_sprites.py`; 9 materials —
deep water, water, sand, mud, soil, rich soil, grass, gravel, rocky) are **32px**; the 13 entity
sprites (`entity_sprites.py`) remain 16px. Deterministic uuids → churn-free re-runs: regenerate
any time by re-running the generators after editing a template.

**Not covered** (no procedural generator — outside the entity/terrain workflow): the lobby/editor UI
icons `spr_back` / `spr_exit` / `spr_revert` (currently unused) and `spr_choo` / `spr_play` (the
Platformer, which stays 32px debug-box art). Author these by hand or add a template if they ever join
the 16px set.
