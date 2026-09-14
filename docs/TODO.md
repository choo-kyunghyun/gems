# TODO

## Issues

- [#15998] Foot rotation for Spine sprites is broken
- [#15999] Mix is ​​not applied to single-key Spine animations like down
- Scene-owned module state — `BuildMode`, `Interactable` and `ColonyCombat` keep their state as `scene._build*` / `scene._inter*` / `scene._hpTrack` fields the scene never declares, and `BuildMode.active` mirrors `scene._buildActive`; each owns a lifecycle, so each is an instance class the scene constructs and drives (docs/ARCHITECTURE.md → Singleton shape), not a singleton writing into its caller
- `sceneColony.update` runs three jobs in one 211-line body — the system order, gameplay rules (the `onKill` / `onRespawn` / `onDown` / `onRecover` closures) and UI timing (the hotbar slide); the rules belong to the systems that own the components they touch, and what is left is the schedule
- `update` signature drift — 26 of the 37 `*System` objects define `update` in six shapes (`(entities)`, `(scene)`, `(scene, now)`, `()`, `(entities, playerId)`, `(entities, dt)`) against the one shape docs/ARCHITECTURE.md states, and 11 define none at all (`Consumable` / `Craft` / `Equipment` / `Faction` / `Favorites` / `Inventory` / `Melee` / `Settlement` / `Stamina` / `Animation` / `Interpolation` are service namespaces); one signature for the tickers, and the `*System` suffix off the rest (docs/NAMING.md)
- Registry facade boilerplate — nine facades each re-declare `_defs` / `_order` and hand-write one-line delegations over `Registry`'s five ops, half as static-only classes (`Item` / `Rarity` / `Manufacturer` / `Recipe`) and half as singletons (`Status` / `InteractAction`); one factory minting the store and its members retires both the duplication and the static-only classes docs/ARCHITECTURE.md already bans for new code
- Per-need wrapper assets — `HungerSystem`, `ThirstSystem` and `DrowsinessSystem` are one token apart over `Survival.tick` / `Survival.restore`, so a need costs a script asset, a folder, a `.yy` and a `gems.yyp` entry for two lines; a need is a data entry against the shared core
- Every consumer guards `entities.get` — 926 `!== undefined` checks, 52 in `EquipmentSystem` alone, because the store has no required-component accessor; and `EquipmentSystem.equip` folding five distinct refusals into one `false` is the same gap on the return side (CLAUDE.md → don't hide errors)
- List+detail screen duplication — `_column` / `_table` / `_rows` / `_fillList` / `_fillDetail` are re-implemented per screen across `StorageUI`, `TradeUI`, `CraftingUI`, `WeaponModUI` and `InventoryUI`; the shape is one Facet widget, not five
- ARCHITECTURE.md and SPINE.md are unscannable — 1,777 words over 41 lines with a 2,142-character line, and 1,880 over 33; the rules they carry cannot be re-read before an edit the way CLAUDE.md requires, so they want rewrapping, not further compression
- Comment mass stands in for structure — 0.32 comment:code overall, `UIElement` at 1.31 and `ColonyMap` at 0.58, carrying ordering constraints (`BEFORE the tick loop`, `after SolidSystem`) that the code cannot state; it is the measure the items above move, not a task of its own

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
