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
- Explosives — the grenade is in (G / LT lobs a `Fuse` charge through `FuseSystem.lob`; unlimited, no item yet); remaining: a grenade item with a `Throwable` capability gating the throw on the bag, and the mine
- Minify furnitures
- Settlement and outpost — foundation done (`Settlement`: a level is one settlement with Name/Faction — the authored colony hub, or an outpost the player founds at a wild site's Survey Post; build mode gated to allied maps); settlement-management UI remains
- Farming and fishing — the flora foundation is in (`FloraSystem` over `Growth`: biome pools, season-weighted growth and spread, built crops, harvest); remaining: fishing, seeds and soil as inputs, a farm plot tied to the settlement's `farm` component
- Raid event: defend the settlement (`musAmbientEmergency` is the reserved BGM)
- Gacha capsule with new UI
- Gamepad reloading
- World map — a trip costs in-game hours but no survival needs; a site's extraction point is its arrival beacon (a separate extraction site is the extraction-shooter tension knob); site codenames from word pools (WORLD_KO) instead of fixed i18n names
- Killfeed UI

## Assets

- More hair sprites for `spineHuman`

## UNDER_REVIEW_SESSION

### Performance

Unfixed per-frame costs on the colony scene (~500 entities, 128² map, ~4.2 ms/frame with the cap lifted: sim ~1.3, renderer ~1.8, GUI ~0.2), in the order their size was measured. A figure here is a same-session ratio from the run that found it; re-measure before acting.

- `SolidSystem` scans `Collision, Position, BBox` twice per tick (the static-cache fingerprint, which also lists the dynamic bodies for `eachBody`, then the body loop with `Velocity`) and `SeparationSystem` scans it again; one shared pass would serve them — `eachBody` is that pass's seed, and `SeparationSystem` could collect from it.
- 14 `RenderTileMap` passes cost ~60 us each in submission overhead alone — one pass per terrain material, nothing per-entity.
- Two unclaimed native wins, neither on a hot path: `array_sort` (~3x over `Array.sort`, no call site large enough to matter) and `point_distance` (~1.8x over the `Math.sqrt` distance in `CombatAI`).
- The frame profile above is a hand probe; a `DEV_MODE` section timer around `sceneColony.update`'s phases would make it a `[BENCH]`-style log line instead.

### UI

- Click cue on non-button widgets — only `UIButton`/`UINav` activation cues today, so a click on a slider/checkbox/list is silent

### Build Mode

- Blueprint UI — stamp a captured or registered plan (`Blueprint.stamp`) for its wood
- Markers in the DEV capture — `entry`/`reach` placed in-game instead of hand-added to the exported literal

### Platform

Console cert routes every player-owned file — the saves, `settings.json`, the input profile — through the async buffer family, which is inert on the pinned runtime (docs/GMRT.md); the path waits for a runtime that lands the write and a devkit to prove it on. The decisions already made:

- Async save — `File` grows a group-unit async pair beside the sync one: one `buffer_async_group_*` request per group carrying the console options, one completion per group, a group name one path component. Two transports under one contract — native on console, `buffer_save_ext` into `<group>/<name>` elsewhere — and every completion lands on a later Step through a `File.update()` drain, never inside the request or the Async event, so a caller sees one order on both.
- `SaveGame` over it — one group per slot, a small per-slot meta file in place of `index.json` (its read-modify-write cannot survive two in-flight saves), the buffers held until the completion frees them, a saving indicator with scene switch and quit gated while busy, and a two-phase load (the manifest, then the blobs it names).
- `Settings`/`InputPreset` follow — writes fire-and-forget with a failure log; their boot-time reads need the boot to wait on them, so they go last. `Log`/`Blueprint`/`entities.dump`/`Screenshot` stay sync as dev tools, the log's file flush off on console.

### Verification

The Core tests are in (`sceneTest` over `testCore` + the `testStress` scenarios, `GEMS_TEST=1 gm-cli run` for the one-command form); one-off probes stay on the `Log`/`Screenshot`/`entities.dump` harness.

- A `testCore` case for what only a real frame boundary catches: the once-per-frame `NavGrid.sync` against a tick-loop edit, an `Input` edge across the frame poll
- More `testStress` scenarios over the same shape as `stress.pathfind`: a raycast storm (hitscan volleys over the static buckets), a spawn/despawn churn (the free list, the flush cost), a tile-edit storm (remesh + `NavGrid.sync` + `onStatics` per frame)
- `testGame` holds the Game-side cases (the doll's rig today); a Game-side cost (the doll's draw path, the frame profile) wants a measure there or the section timer under Performance, never a Core case
