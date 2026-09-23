# TODO

## Issues

- [#15998] Foot rotation for Spine sprites is broken
- [#15999] Mix is ​​not applied to single-key Spine animations like down

## Bugs

- `Snapshot.remove` can't remove a pass inserted as a bare function — `insert` stores its wrapper
- `UIInput._processKeyboard` caches ctrl in a local bool, the `#15549` shape (docs/GMRT.md) — read it live like shift
- `I18n.textRef` decides values vs getters by `params[0]` alone — a mixed list calls a value or passes a getter uncalled
- `GenLakes` and `GenGround` sample the same `noise2(ctx.seed, lattice)` field — at equal lattices lakes trace the ground bands; `salt` is stored but unused

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
- More `testStress` scenarios over the same shape as `stress.pathfind`: a raycast storm (hitscan volleys over the static buckets), a spawn/despawn churn (the free list, the flush cost), a tile-edit storm (remesh + `NavGrid.sync` + a collider-generation restamp per frame)
- A `DEV_MODE` section timer around `sceneColony.update`'s phases, logging the colony frame profile (sim, renderer, GUI) as a `[BENCH]` line in place of the hand probe
- ECS: presence is encoded twice (`column[i]` undefined and `sparse[i]` -1) and data sits by index, not by dense position — the standard packs data beside `dense`; kept for the one-read `get` (`dense.loop` 36 vs `column.loop` 22 ns/op), at `capacity × 2` slots per token

## Assets

- More hair sprites for `spineHuman`
