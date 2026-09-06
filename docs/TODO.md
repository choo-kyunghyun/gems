# TODO

Intent only — contracts live in the code. A sweep applies one mechanical rule across all of `scripts/`, sized so one session can finish and verify it; a sweep too large splits by pillar (Core → Game), never by mixing concerns.

## Dead Code

Noticed in passing, deliberately left unfixed until scheduled. Each: wire a consumer, or drop.

- `Blueprint.stamp` — caller-less until the Blueprint UI (Build Mode below) puts a plan down for wood; `capture` is live as the DEV capture tool's exit.
- The settlement inhabitant/capability layer — `SettlementSystem` is caller-less (`ColonySpawn` attaches `Resident` directly), the `SettlementComponent` registry has no reader, and `Settlement.addComponent`/`removeComponent` (and the record's `color`) are seeds for Farming/raid and the management UI. Route `ColonySpawn` through `SettlementSystem.assign` so the seam is real; keep the rest as deliberate spares. The record half (`found`/`owner`) is live.

## API Shape

- `File.saveAsync`/`loadAsync` break the verb family — rename to `writeBufferAsync`/`readBufferAsync` beside `read`/`readBuffer`. Both are caller-free (parked on GMRT #15223), so the rename is free. `writeBuffer` also returns an unconditional `true` it never verifies.
- Drop `Query.hasCollision` (duplicates `has: Collision`) and migrate its one caller, `contentInteractions`.
- `EntityStore.query()` with no tokens answers every index below `next`, freed ones included (their recycled ids even pass `isValid`) — `dump(this.query())` leans on it, but a "live entities" read wants a presence test; give the no-token form a defined meaning or reject it.
- `MotionPlanner.plan` — fold the speculative `MP_ALGORITHM` selector to `plan(start, goal, opt)` until a second algorithm exists. Planning with no grid bound should `Log.error`, not return the `[]` that also means unreachable.
- `World`'s transfer family returns three shapes — `take` a snapshot or null, `put` an id or -1, `transfer` all three. One family, three failure signals a caller must know apart.
- `UIInput.get focused()` is the kit's lone getter where `UISelect`/`UIDropdown`/`UITable` document "methods, not accessors" — convert it or soften the note.
- `SpriteMeta.fit(scale, sprite)` inverts the sprite-first parameter order of its siblings `density`/`anchor`; four call sites to swap.
- Singleton method style is split in Core/Util: `Log`/`Settings`/`Tracker` self-reference via `this`, the rest via their global name — normalize as a mechanical pass.
- `facetRoot` monkey-patches `insertChild` to the inner column instead of exposing it as a named content property (`facetScroll.scrollBody`, `facetOverlay.body`) — `removeChild` stays un-redirected, so a remove targets the wrapper and silently misses, and the assigned `.content` has no reader.

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
- Radio
- Gamepad reloading
- World map — a trip costs in-game hours but no survival needs; a site's extraction point is its arrival beacon (a separate extraction site is the extraction-shooter tension knob); site codenames from word pools (WORLD_KO) instead of fixed i18n names

## Doll

Gaps left by the rubber-hose rig adoption (spineHuman/spineRat reimports).

- Rat run set — `run` rides `walk` (ColonyPlayer.RIGS) until one is authored.
- Foot tilt — the foot-follows-chain transform constraints are inert on GMRT (docs/GMRT.md), so feet stay flat through every set on both rigs; bake the tilt into each set's foot keys if the flat feet start to read wrong.
- `hair` slot art — the dress slot is live on spineHuman with no sprites to wear in it.
- Downed companions keep standing — the "down" Mortal path only dims a `Visual`; a skeletal doll should play `down0` while `Downed` and restore its state on recover, now that the set exists.
- The spawn-default animation `"idle"` exists on neither rig — every doll spawn logs a "Could not find animation" to stderr before its first setState; point the default at a real set (or key it per rig).

## Pathfinding

Every agent now plans over one level-sized `NavGrid`, so a request can span the whole map; the costs it exposed are in PERF.md → Known Remaining Costs.

- Budget `PathfindingSystem.update` — serve N `PathRequest`s per tick and carry the rest over, so a burst of far requests (a colony's worth of workers re-planning after a wall goes up) is spread across ticks instead of landing in one frame.
- Bound a far plan — a heuristic weight (bounded suboptimality) is the one-line knob; a coarse planner over the fine grid (region graph → refine within the corridor) is the real fix once workers routinely cross the map.
- `LevelGrid.costAt` builds a `NavData` literal per layer per cell — the whole-level resample at a map's first `NavGrid.sync` is mostly that allocation. Have `getNavData` answer a number (undefined = pass through) and the literal goes.

## UI

- Killfeed
- Click cue on non-button widgets — only `UIButton`/`UINav` activation cues today, so a click on a slider/checkbox/list is silent
- Smart HUD (concept)

## Build Mode

- Blueprint UI — stamp a captured or registered plan (`Blueprint.stamp`) for its wood
- Markers in the DEV capture — `entry`/`reach` placed in-game instead of hand-added to the exported literal

## Media

Names predating the naming rules are grandfathered — never rename as a sweep; migrate one only when already touching it.

- Grandfathered: the UI glyphs/lobby art (`vecCheck`/`vecPlay`/`pixUiBox`/…), spare icons (`pixApple`), and the `pixTile16`/`pixTileCornerRough` autotile sets
- Unwired spares: `pixTileFenceSquare`/`pixTileFenceRound` (the blob4 fence sheets kept for debugging — the fence is `RenderFence` geometry now), `wooden_bed_simple`
- A dedicated plan-view TOP pattern per wall material, if the shared face texture ever reads wrong
- New rule for sprites:  128 px per cell · AAP-64 · binary texel alpha · outline for creatures only · shaders do mixing

## Verification

- Test scenes for fast debugging
- Cover what only a running frame can catch (system ordering, grid/collider sync); leave one-off probes on the existing `Log`/`Screenshot`/`entities.dump` harness
