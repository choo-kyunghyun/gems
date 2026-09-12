# TODO

Intent only — contracts live in the code. A sweep applies one mechanical rule across all of `scripts/`, sized so one session can finish and verify it; a sweep too large splits by pillar (Core → Game), never by mixing concerns.

## Gameplay

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

## Doll

Gaps left by the rubber-hose rig adoption (spineHuman/spineRat reimports).

- Foot tilt — the foot-follows-chain transform constraints are inert on GMRT (docs/GMRT.md), so feet stay flat through every set on both rigs; bake the tilt into each set's foot keys if the flat feet start to read wrong.
- `hair` slot art — the dress slot is live on spineHuman with no sprites to wear in it.
- `down` is a single-key pose on both rigs, so a doll snaps into the fallen pose; author the fall as a second key in `art/human/human.spine` / `art/rat/rat.spine` if the snap reads wrong — a `skeleton_animation_mix` crossfade is no shortcut, it is inert on GMRT (docs/GMRT.md).

## Pathfinding

Every agent now plans over one level-sized `NavGrid`, so a request can span the whole map, and that exposed two costs.

- Bound a far plan — an A* expansion is ~6 us (four neighbours: `inBounds`/`get`/`toIndex` calls, a heuristic, a heap push), and over the weighted 128² overworld the unit heuristic is weak enough that a corner-to-corner plan expands ~90% of the cells: ~80–100 ms per far plan against ~2 ms for a 40-cell one, and `PathfindingSystem`'s `budget` bounds count, not time, so one far plan is still a frame hitch. A heuristic weight (bounded suboptimality) is the one-line knob; a coarse planner over the fine grid (region graph → refine within the corridor) is the real fix once workers routinely cross the map.
- `LevelGrid.costAt` builds a `NavData` literal per layer per cell (~3 us a cell) — the whole-level resample at a map's first `NavGrid.sync` or a bulk paint (~50 ms) is mostly that allocation. Have `getNavData` answer a number (undefined = pass through) and the literal goes.

## Performance

Unfixed per-frame costs on the colony scene (~500 entities, 128² map, ~4.2 ms/frame with the cap lifted: sim ~1.3, renderer ~1.8, GUI ~0.2), in the order their size was measured. A figure here is a same-session ratio from the run that found it; re-measure before acting.

- A query still scans the whole index space (`ids.next`), so a sparse component pays for every live entity — ~1.5 ms/frame if every non-matching slot-visit were free. The fix is a per-column dense id list for the SPARSE tokens only (the scene's selectivity: 4 of 43 columns above 50%, 21 at or below 1.7%) — at ~100% selectivity a dense list is the same length plus an indirection and loses, and its upkeep costs ~75% more per component add/detach, so it is opt-in, never blanket.
- `SolidSystem` scans `Collision, Position, BBox` twice per tick (the static-cache fingerprint, which also lists the dynamic bodies for `eachBody`, then the body loop with `Velocity`) and `SeparationSystem` scans it again; one shared pass would serve them — `eachBody` is that pass's seed, and `SeparationSystem` could collect from it.
- `ids.next` is a high-water mark that never shrinks, so a spawn spike permanently raises every query's cost for that map's lifetime. Latent today: the colony sits at `next == alive`, and nothing spawns in bulk.
- 14 `RenderTileMap` passes cost ~60 us each in submission overhead alone — one pass per terrain material, nothing per-entity.
- Two unclaimed native wins, neither on a hot path: `array_sort` (~3x over `Array.sort`, no call site large enough to matter) and `point_distance` (~1.8x over the `Math.sqrt` distance in `CombatAI`).
- The frame profile above is a hand probe; a `DEV_MODE` section timer around `sceneColony.update`'s phases would make it a `[BENCH]`-style log line instead.

## UI

- Killfeed
- Click cue on non-button widgets — only `UIButton`/`UINav` activation cues today, so a click on a slider/checkbox/list is silent

## Build Mode

- Blueprint UI — stamp a captured or registered plan (`Blueprint.stamp`) for its wood
- Markers in the DEV capture — `entry`/`reach` placed in-game instead of hand-added to the exported literal

## Media

Names predating the naming rules are grandfathered — never rename as a sweep; migrate one only when already touching it.

- Grandfathered: the UI glyphs/lobby art (`vecCheck`/`vecPlay`/`pixUiBox`/…), spare icons (`pixApple`), and the `pixTile16` autotile set
- Unwired spares: `pixTileFenceSquare`/`pixTileFenceRound` (the blob4 fence sheets kept for debugging — the fence is `RenderFence` geometry now), `woodenBedSimple`
- A dedicated plan-view TOP pattern per wall material, if the shared face texture ever reads wrong
- New rule for sprites:  128 px per cell · AAP-64 · binary texel alpha · outline for creatures only · shaders do mixing

## Platform

Console cert routes every player-owned file — the saves, `settings.json`, the input profile — through the async buffer family, which is inert on the pinned runtime (docs/GMRT.md); the path waits for a runtime that lands the write and a devkit to prove it on. The decisions already made:

- Async save — `File` grows a group-unit async pair beside the sync one: one `buffer_async_group_*` request per group carrying the console options, one completion per group, a group name one path component. Two transports under one contract — native on console, `buffer_save_ext` into `<group>/<name>` elsewhere — and every completion lands on a later Step through a `File.update()` drain, never inside the request or the Async event, so a caller sees one order on both.
- `SaveGame` over it — one group per slot, a small per-slot meta file in place of `index.json` (its read-modify-write cannot survive two in-flight saves), the buffers held until the completion frees them, a saving indicator with scene switch and quit gated while busy, and a two-phase load (the manifest, then the blobs it names).
- `Settings`/`InputPreset` follow — writes fire-and-forget with a failure log; their boot-time reads need the boot to wait on them, so they go last. `Log`/`Blueprint`/`entities.dump`/`Screenshot` stay sync as dev tools, the log's file flush off on console.

## Verification

The Core tests are in (`sceneTest` over `testCore` + the `testStress` scenarios, `GEMS_TEST=1 gm-cli run` for the one-command form); one-off probes stay on the `Log`/`Screenshot`/`entities.dump` harness.

- A `testCore` case for what only a real frame boundary catches: the once-per-frame `NavGrid.sync` against a tick-loop edit, an `Input` edge across the frame poll
- More `testStress` scenarios over the same shape as `stress.pathfind`: a raycast storm (hitscan volleys over the static buckets), a spawn/despawn churn (`ids.next` high-water mark, the flush cost), a tile-edit storm (remesh + `NavGrid.sync` + `onStatics` per frame)
- The `perf.*` cases measure Core only; a Game-side cost (the doll's draw path, the frame profile) wants a `testColony` or the section timer under Performance, not a Core case
