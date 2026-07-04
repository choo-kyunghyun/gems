# Roadmap

## Art Rework — flat style over a strict projection contract (ACTIVE, decided 2026-07-04)

Retire pixel art for entities. New style: **flat, simple, minimal-shading bitmap art at free resolution** (modern sci-fi — RimWorld's production economics *without* its mixed-projection depth chaos), authored with the two proven tools: **hand-drawn flat parts + Spine animation**. GM3D and AI pixel-art generation are parked (see bottom).

### Projection contract (the depth-coherence rule)

Every world sprite is exactly one of three categories — decided by rule, never per-asset taste (RimWorld's mistake was mixing plan-view and elevation art freely, which forces manual depth-sorting forever):

1. **GROUND** — flat-on-the-floor things (carpets, roads, blood decals, zone paint, crop plots). Drawn in **plan view**, rendered with the floor passes. Never competes with entities for depth, by construction.
2. **STANDING** — anything with height and an organic/complex silhouette (pawns, trees, rocks, creatures). Drawn in **front elevation**, foot-anchored, rendered as billboards → per-pixel depth sorting comes free from the existing depth buffer + `sh_alphatest`.
3. **VOLUME** — boxy furniture/machines (bench, table, bed, shelf, crate, terminal). A new `Volume` component + `RenderVolume` pass draws an axis-aligned box. Under the fixed-yaw 35° ortho camera only **two faces are ever visible — top + front** — so a "box" is two quads: a plan-view **top** texture lying at `height` over the footprint, plus an elevation **front** texture at the footprint's front edge. This solves deep-furniture sorting (pawn behind vs. in front of a workbench) per-pixel with zero manual layering.

Write a half-page style spec **before drawing asset #1**: one implied camera angle for all STANDING art, one light direction, flat fills / minimal shading, palette discipline.

### `Volume` component notes (engine work — small and bounded)

- `Volume { width, depth, height, topSprite, frontSprite, sideSprite? }`; `RenderVolume` inserted in the same depth-tested group as `RenderBillboard`.
- Textures are drawn in **canonical views** (top = plan, front = elevation); the pitched camera foreshortens the lying top face exactly like the terrain, so consistency is automatic (the Minecraft/SM64 trick).
- `sideSprite` is only needed once 90° furniture rotation exists (the side art becomes the front).
- Faces stay **opaque** (or `sh_alphatest` cutout) — never alpha-blend depth-writing geometry; share the top/front edge vertices (or reuse the `BB_LAYER_DZ` bias idea) so the seam can't z-fight.
- `BBox`/`Collision` stay the 2D footprint — `height` is visual-only.
- Pawn-on-furniture (sleeping in a bed): set the pawn's `Position.z` to the furniture height; the depth buffer resolves pawn-over-bed per-pixel (no overlay-sprite hacks).
- **Scope guard**: furniture/props only. Do NOT box the world — walls/terrain stay on the tile pipeline.

### Character pipeline (Spine, license-clean for open source)

- Draw flat parts → rig + animate in **Spine** → export **PNG strips at high resolution** (fixed export bounds per animation so cells stay uniform; 12–15 fps is fine — pixel-cluster stability is no longer a concern) → deterministic import → **`SpriteMeta.density`** scales art to world size (BBox untouched; old and new art coexist during migration).
- **License**: only **baked strips** are game assets — the Spine editor license allows shipping exported images; the restricted parts (runtime + skeleton data) never enter the repo. Commit the `.spine` project files as editable *source* — the same `.mid`→WAV pattern audio-kit uses. Spine's CLI export can script the re-bake like the other importers.
- **Paper-doll survives**: gear = Spine **skins** on the one skeleton; export the base-body strip + one overlay strip per gear piece from the same timeline → frame-aligned by construction → `Appearance`/`AppearanceSystem` and the strip-layout invariant carry over unchanged.
- AI is optional and unblocked: high-res flat/clean styles are what image models are actually good at — usable for part references to trace and clean. No pixel LoRA, no framing fight.

### Migration order

1. The half-page art style spec (camera angle, light direction, palette).
2. First character (player) through Spine → bake → import → verify in-game over the real overworld (screenshot day + night).
3. Strip importer under `tools/` (author → render → import, like the other kits).
4. ~~`Volume` component + `RenderVolume` pass~~ — DONE 2026-07-04 (Core/Component + Core/Render, inserted in `RpgMap.build` for pitched maps; occlusion verified in-game: player in front / behind bench / behind deep table, all per-pixel correct with placeholder colored faces). Remaining: convert real furniture (workbench etc.) once face art exists.
5. Replace entities incrementally (the density seam lets old/new coexist); then items/icons (flat redraw, or SVG→PNG).
6. Terrain **last**: restyle the material textures fed to the style-agnostic dual-grid machinery (`tileset.py`); walls stay tiles.

### Parked / rejected (don't relitigate without new facts)

- **GM3D runtime 3D** (glTF skinned-mesh imposters) — experimental undocumented API, new skill stack, converts an art bottleneck into an engine project. Revisit only if continuous weapon aim becomes a must-have.
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
- Gacha capsule with new UI
- Raid event: Defend the settlement

## Build Mode

- Blueprint
- Drag to select

## Editor

- Prefabs
