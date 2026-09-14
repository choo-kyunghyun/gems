# TODO

## Issues

- Spawn descriptors are read by an if-chain — `ColonySpawn.spawnEntity` is 175 lines of eight `s.preset ===` branches turning descriptor fields into component overrides, and the prop's `s.kind` → mesh model is an eight-arm if-chain standing beside `FURN_MODELS`, the same lookup written as data; the preset half is already an `EntityPreset` def, so the descriptor half wants the same — a per-preset field map over the shared adapter, not an engine edit per kind (docs/ARCHITECTURE.md → adding content is a data entry)
- `Weather` is the last system holding its own content table — `_COND` and `_WEIGHTS` are 66 of its 237 lines (the five conditions' look/temp/chroma, then the per-season transition weights) while every sibling table sits in `Game/Content`; the cross-fade, the hold timer and the climate pin are the system, the conditions are `contentWeather`
- One meter shape, two models — a need (`Thirst` / `Hunger` / `Drowsiness` / `Exposure` / `Cold`) carries `rate` / `max` / `critical` / `status` as per-entity component data seeded from its `contentNeeds` def, but `Endurance` holds `DRAIN` / `REGEN` / `RECOVER` as module constants, so a trait or an attribute can move a need and never a sprint; the sprint meter wants the same shape on `Stamina`
- `contentInteractions` carries the one rule it cannot delegate — the `door` def is 46 of the table's 253 lines (the blocked-body sweep, the solid flip, the mesh yaw, `SolidSystem.invalidate`) where the other fifteen defs are one to six lines of delegation, and `companion` is another 35; the file's own contract is `run` → a system, so the door rule wants a home and its def wants to be a call
- Comment mass stands in for structure — 0.32 comment:code overall, `UIElement` at 1.31 and `ColonyMap` at 0.58, carrying ordering constraints (`BEFORE the tick loop`, `after SolidSystem`) that the code cannot state; it is the measure the items above move, not a task of its own
- [#15998] Foot rotation for Spine sprites is broken
- [#15999] Mix is ​​not applied to single-key Spine animations like down

## Planned

- Runtime upgrade: re-audit every GMRT.md and SPINE.md entry — a fixed defect leaves its workaround as silent dead weight — and re-run `GEMS_TEST=1 gm-cli run gems.yyp` on the candidate; a `perf.*` ratio that moved names the `TODO` at the site citing it, a `testGame` case that flipped names its retirement in its FAIL line, and a JIT (the absolute ns/op collapsing toward V8) makes every hot-path idiom advisory (docs/ARCHITECTURE.md)
- Separating Pathfinding into a different thread using C#
- Modular turret (the built turret auto-fires a hardcoded hitscan today)
    - Auto turrets fire mounted weapons
    - Mountable turrets
- Explosives — the grenade is in (G / LT lobs a `Fuse` charge through `FuseSystem.lob`; unlimited, no item yet); remaining: a grenade item with a `Throwable` capability gating the throw on the bag, and the mine
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
- A `testCore` case for what only a real frame boundary catches: the once-per-frame `NavGrid.sync` against a tick-loop edit, an `Input` edge across the frame poll
- More `testStress` scenarios over the same shape as `stress.pathfind`: a raycast storm (hitscan volleys over the static buckets), a spawn/despawn churn (the free list, the flush cost), a tile-edit storm (remesh + `NavGrid.sync` + `onStatics` per frame)
- A `DEV_MODE` section timer around `sceneColony.update`'s phases, logging the colony frame profile (sim, renderer, GUI) as a `[BENCH]` line in place of the hand probe

## Assets

- More hair sprites for `spineHuman`
