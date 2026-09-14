# TODO

## Issues

- Registry facade boilerplate — nine facades each re-declare `_defs` / `_order` and hand-write one-line delegations over `Registry`'s five ops, half as static-only classes (`Item` / `Rarity` / `Manufacturer` / `Recipe`) and half as singletons (`Status` / `InteractAction`); one factory minting the store and its members retires both the duplication and the static-only classes docs/ARCHITECTURE.md already bans for new code
- Every consumer guards `entities.get` — 926 `!== undefined` checks, 52 in `Loadout` alone, because the store has no required-component accessor; and `Loadout.equip` folding five distinct refusals into one `false` is the same gap on the return side (CLAUDE.md → don't hide errors)
- ARCHITECTURE.md and SPINE.md are unscannable — 1,777 words over 41 lines with a 2,142-character line, and 1,880 over 33; the rules they carry cannot be re-read before an edit the way CLAUDE.md requires, so they want rewrapping, not further compression
- Spawn descriptors are read by an if-chain — `ColonySpawn.spawnEntity` is 175 lines of eight `s.preset ===` branches turning descriptor fields into component overrides, and the prop's `s.kind` → mesh model is an eight-arm if-chain standing beside `FURN_MODELS`, the same lookup written as data; the preset half is already an `EntityPreset` def, so the descriptor half wants the same — a per-preset field map over the shared adapter, not an engine edit per kind (docs/ARCHITECTURE.md → adding content is a data entry)
- `Weather` is the last system holding its own content table — `_COND` and `_WEIGHTS` are 66 of its 237 lines (the five conditions' look/temp/chroma, then the per-season transition weights) while every sibling table sits in `Game/Content`; the cross-fade, the hold timer and the climate pin are the system, the conditions are `contentWeather`
- A component's persistence is declared away from the component — `SaveGame._TRANSIENT` is a five-string literal naming four Core components (`PrevPosition` / `PathRequest` / `PathResponse` / `Instance`) plus `PrevHealth`, whose own JSDoc cites the list back; "runtime-rebuilt" is a fact about the component, so it wants one owner at the component (docs/ARCHITECTURE.md → one owner per fact) and a new transient one stops riding into a save unnoticed — the last field a save pass names by hand now that the world's and each level's records export whole
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
