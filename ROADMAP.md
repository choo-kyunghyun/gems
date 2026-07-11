# Roadmap

## Art — SETTLED (2026-07-11)

The 2026-07 art rework is closed. The engine half landed as designed — every world pass lights through the ONE shader (`sh_meshlit`), the upright-sprite pitch-by-zoom camera is adopted, and the projection contract below is law. The art half settled on a **different endgame than the flat-HD draft**: **hand-drawn 32 px pixel art** for what animates (the Aseprite `spr_human` strip — outlined 2-color figure, white fill tinted per entity as skin; outfit overlays cut from the segmented parts; held weapons = the item's own icon at the hand anchor) plus **hand-drawn 32 px item icons**, **MagicaVoxel meshes** for the boxy world (vox-kit), **near-white 32×32 wall/floor textures** (`spr_tex_*`, texture × tint × light), and the procedural dual-grid terrain. Reference docs: ARCHITECTURE → _Renderer_ + _Paper-doll appearance_ (engine); `tools/pixel-art-kit/GEMS.md` + the importers (source conventions).

Each world thing is exactly one projection category, decided by rule, never per-asset taste (RimWorld's mistake: mixing plan-view and elevation art freely forces manual depth-sorting forever). GROUND never competes for depth by construction; VOLUME/WALLS are depth-writing geometry; STANDING billboards sort per-pixel via the depth buffer + the texel cutout.

| Category                            | Art                                                    |
| ----------------------------------- | ------------------------------------------------------ |
| GROUND — floors, terrain, decals    | flat textures, plan view (dual-grid pipeline)          |
| VOLUME — furniture, machines, rocks | MagicaVoxel meshes (vox-kit), lit by `sh_meshlit`      |
| WALLS / structures                  | lit boxes, near-white face texture × material tint     |
| STANDING — pawns, creatures         | 32 px hand-drawn strips, upright depth-writing sprites |
| Items / icons                       | 32 px hand-drawn icons (double as the held visuals)    |

Mesh rules that stay true: `BBox`/`Collision` are the 2D footprint (mesh size/rotation is visual-only); faces stay opaque or alpha-test cutout — never alpha-blend depth-writing geometry; pawn-on-furniture (sleeping IN a bed) is a `Position.z` lift the depth buffer resolves per-pixel (unbuilt).

### Art follow-ups (incremental, none blocking)

- More wall/floor materials (poured concrete, metal panel, scrap plank); the spare `spr_tex_tile`/`carpet`/`mosaic` sheets as Build-Mode floor variants; a dedicated plan-view TOP pattern per wall material if the shared face texture ever reads wrong.
- Regenerate the 16 px terrain sheets at 32 (they render correctly via UV-stretch; crispness only).
- Wire the spare media: `tree_pine`/`wooden_door`/table/dresser/stool vox meshes, `spr_soda`/`spr_sodaTrash` sprites, the spare SFX/BGM (`snd_hitsound_metal`, `snd_explosion_large`, `mus_ambient_cozy`/`emergency`). Redraw the 16 px fence sheet at 32 (`SpriteMeta density: 0.5` carries it meanwhile).
- Mesh niceties: greedy meshing, manifest-driven `BBox`, `.obj` frontend, box-path side sprites.

### Parked / rejected (don't relitigate without new facts)

- **Flat-HD Spine characters** — the outline-free flat style the rework originally drafted (density-2 Spine bakes, S/V palette bands, albedo-only). PARKED 2026-07-11: the hand-drawn 32 px doll settled the style first. The pipeline design stays valid for a future fidelity jump — flat parts → Spine rig → baked PNG strips (license-clean: only exported images ship, `.spine` files committed as source, runtime/skeleton data never enter the repo) → one frame-aligned overlay strip per gear skin keeps the paper-doll contract → `SpriteMeta.density` scales art to world size with BBoxes untouched. The manifest `anchors` system is the runtime seam it slots into.
- **GM3D runtime 3D** — spiked 2026-07-05: glTF loads + renders and the camera was matched exactly, but a Screen-target camera always clears its rect (color + depth) and `setAlpha` is whole-output opacity → no depth interop with the billboard pass → disqualified for VOLUME. Parked for character imposters via render-to-texture (untested).
- **AI-generated entity art** (the ComfyUI 32 px pipeline, pixel-art LoRA hunting) — superseded twice: by the flat-HD draft, then by hand-drawing (2026-07-08/09 decision, confirmed by the settled set). Toolchain kept for reference only.
- **Enlarging the world cell** — RESOLVED 2026-07-11: the cell moved 16 → 32 px to meet the hand-authored media set (moving the one world anchor beat rescaling every asset), not for entity detail.
- **Spine runtime in-engine** (license-incompatible with open source), **per-frame AI animation** (flicker) — dead ends.

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
