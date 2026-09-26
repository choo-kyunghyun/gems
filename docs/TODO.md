# TODO

## Issues

- [#15998] Foot rotation for Spine sprites is broken
- [#15999] Mix is ​​not applied to single-key Spine animations like down

## Planned

- Runtime upgrade: re-audit every GMRT.md and SPINE.md entry — a fixed defect leaves its workaround as silent dead weight — and re-run `GEMS_TEST=1 gm-cli run gems.yyp` on the candidate; a `perf.*` ratio that moved names the `TODO` at the site citing it, a `testGame` case that flipped names its retirement in its FAIL line, and a JIT (the absolute ns/op collapsing toward V8) makes every hot-path idiom advisory (docs/ARCHITECTURE.md)
- Separating Pathfinding into a different thread using C#
- Modular turret (the built turret auto-fires a hardcoded hitscan today)
    - Auto turrets fire mounted weapons
    - Mountable turrets
- Explosives — the grenade is in (G / LT lobs a `Fuse` charge through `Combat.lob`; unlimited, no item yet); remaining: a grenade item with a `Throwable` capability gating the throw on the bag, and the mine
- Minify furnitures
- Settlement and outpost — foundation done (`Settlement`: a level is one settlement with Name/Faction — the authored colony hub, or an outpost the player founds at a wild site's Survey Post; build mode gated to allied maps); settlement-management UI remains
- Farming and fishing — the flora foundation is in (`FloraSystem` over `Growth`: biome pools, season-weighted growth and spread, built crops, harvest); remaining: fishing, seeds and soil as inputs, a farm plot tied to the settlement's `farm` component
- Raid event: defend the settlement (`musAmbientEmergency` is the reserved BGM)
- Gacha capsule with new UI
- Gamepad reloading
- World map — a trip costs in-game hours but no survival needs; a site's extraction point is its arrival beacon (a separate extraction site is the extraction-shooter tension knob); site codenames from word pools (WORLD_KO) instead of fixed i18n names
- Killfeed UI
- Click cue on non-button widgets — only `UIButton`/`UINav` activation cues today, so a click on a slider/checkbox/list is silent
- Blueprint UI — stamp a captured or registered plan (`Blueprint.stamp`) for its wood
- Markers in the DEV capture — `entry`/`reach` placed in-game instead of hand-added to the exported literal
- More `testStress` scenarios over the same shape as `stress.pathfind`: a raycast storm (hitscan volleys over the static buckets), a spawn/despawn churn (the free list, the flush cost), a tile-edit storm (`SolidTiles.sync` + `NavGrid.sync` per frame)
- A `DEV_MODE` section timer around `sceneColony.update`'s phases, logging the colony frame profile (sim, renderer, GUI) as a `[BENCH]` line in place of the hand probe

## Core Structure

The Core folder tree reads as its dependency layers — a move, never a behaviour change.

- A `Puppet` area for the instance bridge (`Instance`, `PuppetSystem`, the `Puppet`/`Solid` objects) out of `Collision`, so `Sprite`, `Render` and `Nav` depend on the bridge, not on collision
- `EntityPreset` out of `Entity` into an area above `Sprite`/`Render` — it builds looks — ending the Entity↔Render cycle
- Unwired: `CameraPan` (no installer), `CameraFly` (tests only), `Lifetime` (no Game carrier) — wire, drop, or a clause each
- `Render` subfolders: passes, debug passes, geometry (`Vox`, `Poly`, `VertexBuffer`, `VertexBatch`, `Chunks`)
- `UIDraw`'s free globals into one namespace
- Store mechanisms: whether `derive` folds into `of` behind an option — both have few call sites against the invariants they carry
- Level cells span nine types in five areas (`Grid`, `LevelGrid`, `TileLayer`, `TileType`, `ZoneMap`, `SolidTiles`, `NavGrid`, `MotionPlanner`, `Chunks`); the edit-log readers (`SolidTiles`, `NavGrid`, `Chunks`) share one cursor shape, a shared reader once they drift

## Assets

- More hair sprites for `spineHuman`
