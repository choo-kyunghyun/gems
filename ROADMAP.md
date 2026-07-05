# Roadmap

## Art Rework — flat style over a strict projection contract (ACTIVE, decided 2026-07-04)

Retire pixel art for entities. **Flat, simple bitmap art at free resolution** (modern sci-fi — RimWorld's production economics _without_ its mixed-projection depth chaos) for what animates, **voxel meshes** for the static boxy world — unified by **real 3D lighting instead of outlines** (decided 2026-07-05: normals are free on meshes, a flat sprite is one bent normal, so light + palette contrast do the visual separation contour lines used to).

### Per-category plan (the projection contract)

Each world thing is exactly one category, decided by rule, never per-asset taste (RimWorld's mistake: mixing plan-view and elevation art freely forces manual depth-sorting forever). GROUND never competes for depth by construction; VOLUME/WALLS are real depth-writing geometry; STANDING billboards sort per-pixel via the depth buffer + `sh_meshlit`'s texel cutout. **Every world pass lights through the ONE shader** (`sh_meshlit` — vox or textured mode, normals per-vertex or per-submit; unified 2026-07-06).

| Category                            | Art                                               | Status                 |
| ----------------------------------- | ------------------------------------------------- | ---------------------- |
| GROUND — floors, terrain, decals    | flat textures, plan view (dual-grid pipeline)     | **DONE** (lit + bands) |
| VOLUME — furniture, machines, rocks | MagicaVoxel meshes (vox-kit), lit by `sh_meshlit` | **DONE**               |
| WALLS / structures                  | meshes too (lit boxes over the wall `TileLayer`)  | LIVE (art pending)     |
| STANDING — pawns, creatures         | flat sprites, front elevation, UPRIGHT billboards | Spine pipeline pending |
| Items / icons                       | flat redraw (or SVG→PNG)                          | pending                |

### Done (details live in ARCHITECTURE → `RenderMesh`, CLAUDE.md → Capabilities, `tools/vox-kit/README.md`)

- ~~`Mesh` component + `RenderMesh` depth pass~~ — 2026-07-04, per-pixel occlusion verified.
- ~~MagicaVoxel pipeline~~ — 2026-07-05: `vox2vbuf.py` → committed `.vox` source → `.vbuf`; per-axis `Mesh` scaling; 10 models baked.
- ~~Furniture conversion~~ — 2026-07-05: workbench/bed/cot/barrel/torch/lantern/turret presets + the rock scatter/`boulder_cluster` prefab are mesh entities (`Mesh` INSTEAD of `Visual`); Build Mode Cot + Lantern. `stand.vox` baked, unwired. Still sprites: crate, fence, chest, survey post, survival stations, door, arcade.
- ~~Mesh lighting~~ — 2026-07-05: albedo + packed per-face normals, `sh_meshlit` = `WorldClock.sunDir()` sun + ≤8 point lights (wrap-lit, linear falloff, sun-complement ambient, CPU view culling). Composes under the light map: shader = direction, light map = absolute darkness.
- ~~Wall-mesh pass, phase 1~~ — 2026-07-05: `RenderWalls` draws the resident wall `TileLayer` as lit boxes (per-cell top + exposed south faces, build-time hidden-face removal) under `sh_meshlit`, sharing `RenderMesh`'s sun + culled point lights; day/night + lantern verified, BuildMode edits remesh via the existing markDirty chain.
- ~~Wall textures, engine side~~ — 2026-07-05: `sh_meshlit` textured mode (`u_useTex` + per-submit `u_normal`; fsh-declared — vsh uniforms silently dead on GMRT, see CLAUDE.md) — texture × tint × light on wall faces; stand-in texture = `spr_floorTiles` frame 0 as brick.
- ~~Camera: upright sprites + pitch-by-zoom~~ — ADOPTED 2026-07-05: `RenderBillboard` draws upright (tilt −90 constant; a perpendicular-to-view billboard reclines ~cos(pitch) along the ground and buried into wall meshes at contact), camera pitch = `RpgMap._pitchCurve` (42° zoomed out → 58° in, Debug-toggleable), `followHeight` −1000 (near-plane fix). Mob/player BBoxes bumped toward visual size (player 12 wp, raider ≈13.6 — still through 16px doorways).
- ~~Sprite sun response~~ — 2026-07-06: `RenderBillboard` modulates each sprite's tint (body + doll layers identically) by the `sh_meshlit` model evaluated once per entity on the CPU at a fixed bent normal, reading the sun + the point-light set `RenderMesh` gathered that frame — sprites dim/warm with the sun and catch torchlight like the mesh faces beside them (noon = authored colors; light map still owns darkness). Verified by red-sun A/B + night torch shots.
- ~~Chunked-overworld authored walls → lit pass~~ — 2026-07-06: `ChunkManager.wallLayer()` (whole-store wall occupancy — records are the immutable world after pregeneration, so it rasterizes once, no streaming coupling) feeds a second `RenderWalls` instance; `RenderChunks`' flat wall rects retired on pitched maps (`opt.walls`). Hub building + prefab ruins/camps now brick lit boxes; verified noon + midnight.
- ~~Terrain + floor finish~~ — 2026-07-06: resident layers render as real tilemaps again (interiors were the debug cost fill; the fill is now an off-default debug overlay); terrain materials pulled into the spec GROUND bands (deepwater/richsoil were the outliers); floor = `spr_floorTiles` frame 4 offset-weave tinted wood-tan (frame 0 brick stays the wall stand-in); resident terrain tint = the streamed-grass olive.
- ~~ONE world shader~~ — 2026-07-06: `sh_meshlit` gains the texel-cutout mode (`u_alphaRef`; `sh_alphatest` deleted) and EVERY world pass submits through it — billboards per-pixel at the bent `u_normal` (the CPU per-entity tint retired), ground (`TerrainStream` + `RenderTileMap`, `VertexBuffer` → `position_3d`) under the straight-up normal, walls/meshes as before. One light gather per frame (`RenderMesh._setupLights`) feeds all of it; the light map keeps owning absolute darkness. Verified: a red sun tints terrain, walls, rocks, and every sprite together; noon identical to authored colors.

### Next

1. **Style spec** — DRAFTED below (2026-07-06); review, edit, approve — then it governs asset #1.
2. **Wall art**: per wall pattern TWO tileable grayscale textures (top + side, replacing the single `spr_floorTiles` stand-in on both faces) + a tint per material. Floors/terrain stay tiles.
3. **First character through Spine** → bake → import → verify in-game day + night. Then the strip importer under `tools/` (author → render → import, like the other kits).
4. Replace entities incrementally (the density seam lets old/new coexist); then items/icons.

### Style spec (DRAFT — review/edit, then this section governs every new asset)

**One sentence**: flat, saturated, outline-free subjects on desaturated ground, separated by real lighting, not contour lines — a modern-survival palette for a failed-terraforming colony.

- **World density** (one anchor: the 16 px cell). VOLUME/WALLS author at **1 source px = 1 world px** (a 16³ vox block per cell; wall face textures 16×16 per cell). STANDING sprites (Spine bakes) export at **`SpriteMeta.density: 4`** (4 source px per world px — a ~48-world-px character exports ~192 px tall): at max zoom (×5.25 on a 1080p surface) that is ≥ 1 source px per ~1.3 screen px, so characters stay crisp everywhere while texture pages stay sane; density 8 doubles page cost for no visible gain. Item icons: density 2 (drawn small, UI-only).
- **No outlines, anywhere.** Separation is (1) the projection contract (depth buffer), (2) lighting — sun N·L + point lights hit meshes per-face and sprites per-entity (the sprite sun response), and (3) **palette contrast bands**:
  - GROUND: desaturated, mid-dark — **S ≤ 35 %, V 40–70 %**. Terrain must recede.
  - VOLUME/WALLS: mid saturation — **S 30–60 %**; material reads by hue + the lit face split (bright top / darker south), not texture noise.
  - STANDING + interactables: saturated, bright — **S 60–90 %, V 70–95 %**. Pawns pop off any floor with no contour line.
- **Author albedo only.** No baked directional shading or shadows — the runtime shades (sun arc, torches) and `RenderEntityShadow` grounds every body. Interior detail (a seam, a panel line) is a hue/value step, never a dark outline stroke.
- **Light**: the canonical sun is the `WorldClock` arc — east → west, constant southward lean, 65° max elevation, warm at the horizons, white at noon; night is the light map plus warm points (torch `#ffd09a`, lantern `#ffedc9`). **Acceptance check for every asset**: screenshot at noon, dusk, and night-beside-a-torch before it lands.
- **Palette**: DB32 is retired for entities (it stays inside the legacy pixel tilesets until the terrain restyle). Ground hues harmonize with the `RpgBiomes.PALETTE` reference; entities are free RGB within the bands above. Reserved signal colors stay signals — ally green, hostile red, rarity tiers, UI accent `#4a9eff` — never costume colors.
- **Proportions**: keep the big-head readable silhouette (~3 heads tall) from the blob template era; author upright and slightly tall — the pitched camera foreshortens upright sprites to sin(pitch) (~74–85 %), so err tall, never squat. Foot-anchored, hard alpha (soft edges write depth — billboard rule).

### Character pipeline (Spine, license-clean for open source)

- Draw flat parts → rig + animate in **Spine** → export **PNG strips at high resolution** (fixed export bounds per animation so cells stay uniform; 12–15 fps is fine) → deterministic import → **`SpriteMeta.density`** scales art to world size (BBox untouched).
- **License**: only **baked strips** are game assets — the Spine editor license allows shipping exported images; the restricted parts (runtime + skeleton data) never enter the repo. Commit the `.spine` project files as editable _source_ — the same `.mid`→WAV pattern audio-kit uses. Spine's CLI export can script the re-bake.
- **Paper-doll survives**: gear = Spine **skins** on the one skeleton; export base-body + one overlay strip per gear piece from the same timeline → frame-aligned by construction → `Appearance`/`AppearanceSystem` carry over unchanged.
- AI is optional and unblocked: high-res flat/clean styles are what image models are good at — part references to trace and clean.

### Mesh rules (still true)

- `BBox`/`Collision` stay the 2D footprint — mesh size/scale is visual-only.
- Faces stay **opaque** or alpha-test cutout — never alpha-blend depth-writing geometry.
- Pawn-on-furniture (sleeping in a bed): set the pawn's `Position.z` to the furniture height; the depth buffer resolves it per-pixel.
- The analytic two-quad box (`width/depth/height` + top/front sprite-or-color faces) remains for model-less `Mesh` — drawn unlit, outside `sh_meshlit`.
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
