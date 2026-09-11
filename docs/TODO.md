# TODO

Intent only — contracts live in the code. A sweep applies one mechanical rule across all of `scripts/`, sized so one session can finish and verify it; a sweep too large splits by pillar (Core → Game), never by mixing concerns.

## API Shape

Contract — the meaning changes, so the callers move with it:

- `EntityStore.query()` with no tokens answers every index below `next`, freed slots included (a freed index holds its next owner's id, which passes `isValid`); no code calls it, only `dump`'s JSDoc offers `dump(this.query())` as the whole-store form. Give the no-token form a defined meaning (the live ids) or reject it, and point `dump` at whichever wins.
- `World`'s transfer family answers three shapes — `take` a snapshot or null, `put` an id or -1, `transfer` all three. `transfer` has no caller (`ColonyMap`/`Trader` pair `take`/`put` themselves) — drop it, then settle `take`/`put` on one failure signal.
- `facetRoot({ maxWidth })` monkey-patches `insertChild` through to the inner column, leaves `removeChild` on the wrapper (a remove of a column child misses silently), and assigns a `.content` nothing reads; the bare form has no column at all. Give both forms one named content element the way `facetScroll.scrollBody`/`facetOverlay.body` do, and drop the patch — one live site, `sceneLobby`.

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

Every agent now plans over one level-sized `NavGrid`, so a request can span the whole map; the costs it exposed are in PERF.md → Known Remaining Costs.

- Bound a far plan — a heuristic weight (bounded suboptimality) is the one-line knob; a coarse planner over the fine grid (region graph → refine within the corridor) is the real fix once workers routinely cross the map.
- `LevelGrid.costAt` builds a `NavData` literal per layer per cell — the whole-level resample at a map's first `NavGrid.sync` is mostly that allocation. Have `getNavData` answer a number (undefined = pass through) and the literal goes.

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

- Test scenes for fast debugging
- Cover what only a running frame can catch (system ordering, grid/collider sync); leave one-off probes on the existing `Log`/`Screenshot`/`entities.dump` harness
