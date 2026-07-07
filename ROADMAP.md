# Roadmap

## Art Rework — flat sprites & textures (ACTIVE; engine substrate COMPLETE 2026-07-06)

Retire pixel art for entities. **Flat, simple bitmap art at free resolution** (modern sci-fi — RimWorld's production economics _without_ its mixed-projection depth chaos) for what animates, **voxel meshes** for the static boxy world — unified by **real 3D lighting instead of outlines**. The engine half is DONE: every world pass lights through the ONE shader (`sh_meshlit` — vox or textured mode, texel cutout, normals per-vertex or per-submit), the upright-sprite pitch-by-zoom camera is adopted, terrain/floors are lit and inside the spec's ground bands. **What remains is pure art on two fronts: FLAT SPRITES (Spine characters) and TEXTURES (walls, floor patterns).** Engine milestone history lives in the git log (2026-07-04 → 07-06) and ARCHITECTURE (`RenderMesh`/`RenderWalls`/`RenderBillboard`/Ground lighting).

### The projection contract (engine: DONE — per-asset status)

Each world thing is exactly one category, decided by rule, never per-asset taste (RimWorld's mistake: mixing plan-view and elevation art freely forces manual depth-sorting forever). GROUND never competes for depth by construction; VOLUME/WALLS are depth-writing geometry; STANDING billboards sort per-pixel via the depth buffer + the texel cutout.

| Category                            | Art                                               | Status                     |
| ----------------------------------- | ------------------------------------------------- | -------------------------- |
| GROUND — floors, terrain, decals    | flat textures, plan view (dual-grid pipeline)     | **DONE** (lit + bands)     |
| VOLUME — furniture, machines, rocks | MagicaVoxel meshes (vox-kit), lit by `sh_meshlit` | **DONE**                   |
| WALLS / structures                  | lit boxes; textures = the TEXTURES front below    | engine done, ART pending   |
| STANDING — pawns, creatures         | flat sprites, upright billboards, per-pixel lit   | engine done, SPINE pending |
| Items / icons                       | flat redraw (density 2)                           | pending (after STANDING)   |

### Front 1 — TEXTURES (walls first; unblocks the built world's look)

1. **Wall art**: per wall pattern **TWO tileable grayscale 16×16 textures** — a TOP (plan view) and a SIDE (elevation) — replacing the single `spr_floorTiles` frame-0 brick standing in on both faces today; the material color stays a TINT (`texture × tint × light`), so one pattern serves every material. `RenderWalls` already takes `sprite`/`frame` per face orientation — the engine seam is ready. Author via a `terrain_materials.py`-style generator (`wall_materials`?), hand-drawn 16px, or externally-generated AI (tileable-texture prompts) — decide at asset #1. Starter pattern set to decide: poured concrete, metal panel, brick, scrap/plank.
2. **Floor patterns**: extend/replace the legacy `spr_floorTiles` grayscale pattern sheet (offset-weave shipped as parquet; candidates: concrete slab, metal deck, tile) — each is one new frame + a Build-Mode floor variant later.
3. Terrain is DONE — only revisit if the spec's ground bands change.

### Front 2 — FLAT SPRITES (Spine characters — the deep-focus track)

1. **Style spec approval** (below) — the STANDING bands, density 4, and proportions govern asset #1; the ground bands are already approved-by-use.
2. **First character end-to-end**: draw flat parts → rig in Spine → bake strips → import at `SpriteMeta.density: 4` → verify in-game noon / dusk / night-beside-a-torch. Prove the pipeline on ONE character (the player) before scaling.
3. **Strip importer** under `tools/` (author → render → import, churn-free re-runs — same shape as the other kits), including the paper-doll overlay contract: base body + one frame-aligned overlay strip per gear piece from the same timeline (skins), so `Appearance`/`AppearanceSystem` carry over unchanged.
4. **Replace entities incrementally** (the `SpriteMeta.density` seam lets old/new coexist): humanoid doll + outfits first (player/raider/NPC/companion all share the one skeleton), then the rat, then the remaining sprite props — crate, fence, chest, survey post, survival stations, door, arcade — deciding per prop: boxy → vox model, organic/flat → sprite.
5. **Items/icons last** (flat redraw or SVG→PNG at density 2).

### Style spec (DRAFT — ground bands approved-by-use 2026-07-06; review the STANDING bands, density 4, and proportions before asset #1)

**One sentence**: flat, saturated, outline-free subjects on desaturated ground, separated by real lighting, not contour lines — a modern-survival palette for a failed-terraforming colony.

- **World density** (one anchor: the 16 px cell). VOLUME/WALLS author at **1 source px = 1 world px** (a 16³ vox block per cell; wall face textures 16×16 per cell). STANDING sprites (Spine bakes) export at **`SpriteMeta.density: 4`** (4 source px per world px — a ~48-world-px character exports ~192 px tall): at max zoom (×5.25 on a 1080p surface) that is ≥ 1 source px per ~1.3 screen px, so characters stay crisp everywhere while texture pages stay sane; density 8 doubles page cost for no visible gain. Item icons: density 2 (drawn small, UI-only).
- **No outlines, anywhere.** Separation is (1) the projection contract (depth buffer), (2) lighting — sun N·L + point lights hit meshes per-face and sprites per-entity (the sprite sun response), and (3) **palette contrast bands**:
  - GROUND: desaturated, mid-dark — **S ≤ 35 %, V 40–70 %**. Terrain must recede.
  - VOLUME/WALLS: mid saturation — **S 30–60 %**; material reads by hue + the lit face split (bright top / darker south), not texture noise.
  - STANDING + interactables: saturated, bright — **S 60–90 %, V 70–95 %**. Pawns pop off any floor with no contour line.
- **Author albedo only.** No baked directional shading or shadows — the runtime shades (sun arc, torches) and `RenderEntityShadow` grounds every body. Interior detail (a seam, a panel line) is a hue/value step, never a dark outline stroke.
- **Light**: the canonical sun is the `WorldClock` arc — east → west, constant southward lean, 65° max elevation, warm at the horizons, white at noon; night is the light map plus warm points (torch `#ffd09a`, lantern `#ffedc9`). **Acceptance check for every asset**: screenshot at noon, dusk, and night-beside-a-torch before it lands.
- **Palette**: DB32 is retired for entities. Ground hues harmonize with the `RpgBiomes.PALETTE` reference (the terrain materials already sit in the bands); entities are free RGB within the bands above. Reserved signal colors stay signals — ally green, hostile red, rarity tiers, UI accent `#4a9eff` — never costume colors.
- **Proportions**: keep the big-head readable silhouette (~3 heads tall) from the blob template era; author upright and slightly tall — the pitched camera foreshortens upright sprites to sin(pitch) (~74–85 %), so err tall, never squat. Foot-anchored, hard alpha (soft edges write depth — billboard rule).

### Character pipeline (Spine, license-clean for open source)

- Draw flat parts → rig + animate in **Spine** → export **PNG strips at high resolution** (fixed export bounds per animation so cells stay uniform; 12–15 fps is fine) → deterministic import → **`SpriteMeta.density`** scales art to world size (BBox untouched).
- **License**: only **baked strips** are game assets — the Spine editor license allows shipping exported images; the restricted parts (runtime + skeleton data) never enter the repo. Commit the `.spine` project files as editable _source_ — the same `.mid`→WAV pattern audio-kit uses. Spine's CLI export can script the re-bake.
- **Paper-doll survives**: gear = Spine **skins** on the one skeleton; export base-body + one overlay strip per gear piece from the same timeline → frame-aligned by construction → `Appearance`/`AppearanceSystem` carry over unchanged.
- AI is optional: high-res flat/clean styles are what image models are good at — part references to trace and clean. Generated externally if used at all (the in-repo ComfyUI experiment client was removed); picked winners still enter GameMaker through the existing importers.

### Mesh rules (still true)

- `BBox`/`Collision` stay the 2D footprint — mesh size/scale is visual-only.
- Faces stay **opaque** or alpha-test cutout — never alpha-blend depth-writing geometry.
- Pawn-on-furniture (sleeping in a bed): set the pawn's `Position.z` to the furniture height; the depth buffer resolves it per-pixel.
- The analytic two-quad box (`width/depth/height` + top/front sprite-or-color faces) remains for model-less `Mesh` — unlit by contract (sprite faces pass through `sh_meshlit` only for the texel cutout).
- Later niceties: greedy meshing, manifest-driven `BBox`, `.obj` frontend, 90° furniture rotation (needs east/west faces + `sideSprite`).

### Parked / rejected (don't relitigate without new facts)

- **GM3D runtime 3D** — spiked 2026-07-05: glTF loads + renders and the camera was matched exactly, but a Screen-target camera always clears its rect (color + depth) and `setAlpha` is whole-output opacity → no depth interop with the billboard pass → disqualified for VOLUME. Parked for character imposters via render-to-texture (untested).
- **AI pixel-art entity generation** (ComfyUI 32px pipeline) — superseded by this rework; toolchain kept for reference.
- **Spine runtime in-engine** (license-incompatible with open source), **per-frame AI animation** (flicker), **pixel-art LoRA hunting** — dead ends.

## Features

- Save and Load

## UI

- Killfeed UI

## Gameplay

- Modular turret
  - Auto turrets fire mounted weapons
  - Mountable turrets
- Explosive like grenade and mine
- Minify furnitures
- Merchants and wandering traders
  - Inter-level interaction
- Settlement and outpost
- Farming and fishing
- Gamepad reloading
- More role-playing infos
  - Biological sex(Display as XX and XY)
  - Optional age
  - Virtual companies and ads
- Gacha capsule with new UI
- Raid event: Defend the settlement
- Radio
- UI Concept: Smart HUD
- Darkmode and lightmode theme
- Conway's Game of Life

## Build Mode

- Blueprint
- Drag to select

## Editor

- Prefabs
