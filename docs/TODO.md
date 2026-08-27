# TODO

Intent only — contracts live in the code. A sweep applies one mechanical rule across all of `scripts/`, sized so one session can finish and verify it; a sweep too large splits by pillar (Core → Game), never by mixing concerns.

## Chores

- Remove unused levels in datafiles
- Consider adopting Spine2d and removing SpriteMeta

## Dead Code

Noticed in passing, deliberately left unfixed until scheduled. Each: wire a consumer, or drop.

- `World.update` is unwired scaffolding — `sceneColony` drives `WorldClock`/`WorldEvents` directly (it does call `World.reset`), and `update` carries the engine → gameplay-kit edge. Wire the phase-2 routing (clock injected, not named) or drop it.
- `Blueprint` — caller-less since a save restores each map's store whole (nothing replays builds); `capture`/`stamp` are the Blueprint UI's seam (Build Mode below), kept as a deliberate spare.
- `InputPreset` — `save`/`load` are never invoked, so the keymap and `Input.deadzone` only ever hold hardcoded defaults and `input.json` is never written. Load at boot, or drop the module.
- `InputAction.unbindButton`/`unbindAxis` — `UIRebind` remaps by assigning `action.buttons[0]` directly.
- `UIMinimap`/`gemsMinimap` — `RadarArrows` is the shipped radar, and the factory is `UIMinimap`'s only constructor site. If kept as a spare, its fixed `target` id also predates the live-queries invariant (take a getter, or resolve `CameraFocus`).
- `gemsWindow` and the `UIDrag`/`UIResize` pair it is the sole constructor of — the colony windows use `gemsOverlay`. A three-module spare chain like `UIMinimap`/`gemsMinimap`.
- The settlement inhabitant/capability layer — `SettlementSystem` is caller-less (`ColonySpawn` attaches `Resident` directly), the `SettlementComponent` registry has no reader, and `Settlement.addComponent`/`removeComponent` (and the record's `color`) are seeds for Farming/raid and the management UI. Route `ColonySpawn` through `SettlementSystem.assign` so the seam is real; keep the rest as deliberate spares. The record half (`found`/`owner`) is live.
- `RenderZone`/`RenderZoneLabel` — caller-less since a settlement became a whole level (the `settlement` channel was their one target), and no level file or prefab authors a `zones` channel, so no zone overlay draws anywhere. Keep as the engine's zone passes, or drop with the next zone-consumer decision.

## API Shape

- `File.saveAsync`/`loadAsync` break the verb family — rename to `writeBufferAsync`/`readBufferAsync` beside `read`/`readBuffer`. Both are caller-free (parked on GMRT #15223), so the rename is free. `writeBuffer` also returns an unconditional `true` it never verifies.
- Drop `Query.hasCollision` (duplicates `has: Collision`) and migrate its one caller, `contentInteractions`.
- `EntityStore.query()` with no tokens answers every index below `next`, freed ones included (their recycled ids even pass `isValid`) — `dump(this.query())` leans on it, but a "live entities" read wants a presence test; give the no-token form a defined meaning or reject it.
- `MotionPlanner.plan` — fold the speculative `MP_ALGORITHM` selector to `plan(start, goal, opt)` until a second algorithm exists. Planning with no grid bound should `Log.error`, not return the `[]` that also means unreachable.
- `World`'s transfer family returns three shapes — `take` a snapshot or null, `put` an id or -1, `transfer` all three. One family, three failure signals a caller must know apart.
- `UIInput.get focused()` is the kit's lone getter where `UISelect`/`UIDropdown`/`UITable` document "methods, not accessors" — convert it or soften the note.
- `SpriteMeta.fit(scale, sprite)` inverts the sprite-first parameter order of its siblings `density`/`anchor`; four call sites to swap.
- Singleton method style is split in Core/Util: `Log`/`Settings`/`Tracker` self-reference via `this`, the rest via their global name — normalize as a mechanical pass.
- `gemsDropdown` ignores the `opts.onChange` its sibling `gemsSelect` fires after `Settings.set`, and has zero callers; `GameOverlay` hand-rolls the same binding over `gemsDropdownCustom` because it needs the apply hook. Pass `onChange` through and the hand-roll folds into the factory.
- `gemsSlider(key, min, max, step, opts)` is the kit's only positional signature, forcing live callers to pass a placeholder; fold min/max/step into the opts bag like `gemsStepper`.
- `gemsRoot` monkey-patches `insertChild` to the inner column instead of exposing it as a named content property (`gemsScroll.scrollBody`, `gemsOverlay.body`) — `removeChild` stays un-redirected, so a remove targets the wrapper and silently misses, and the assigned `.content` has no reader.
- `gemsSelectCustom` lost its doc line and its sizing: the header sits stranded above `gemsFieldPanel`, and it builds `gemsFieldPanel({})` where every sibling field control forwards `height`/`width` (latent — callers pass only `tooltip`).

## Gameplay

- Modular turret (the built turret auto-fires a hardcoded hitscan today)
    - Auto turrets fire mounted weapons
    - Mountable turrets
- Explosives — the grenade is in (G / LT lobs a `Fuse` charge through `FuseSystem.lob`; unlimited, no item yet); remaining: a grenade item with a `Throwable` capability gating the throw on the bag, and the mine
- Minify furnitures
- Settlement and outpost — foundation done (`Settlement`: a level is one settlement with Name/Faction — the authored colony hub, or an outpost the player founds at a wild site's Survey Post; build mode gated to allied maps); settlement-management UI remains
- Farming and fishing (farming layers on a settlement's level)
- Raid event: defend the settlement (`musAmbientEmergency` is the reserved BGM)
- Gacha capsule with new UI
- Radio
- Gamepad reloading
- World map — a trip costs in-game hours but no survival needs; a site's extraction point is its arrival beacon (a separate extraction site is the extraction-shooter tension knob); site codenames from word pools (WORLD_KO) instead of fixed i18n names

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

- Blueprint UI
- Drag to select

## Editor

The level file, a `Prefab`, and a generator's output are now one shape (`LevelData`); the editor is the half still on its own parallel model.

- Paint the real `contentTiles` stack instead of the editor's two hardcoded layers, so the brush palette comes from `LAYERS` (+ the wall materials) and an entry the editor can't model stops being parked and re-emitted blind (`sceneEditor._loadTiles`).
- Author `meta.entries` (named spawn points) — only the legacy `playerSpawn` is editable today, so an edited level can't place its arrival entry beside a travel beacon.
- Draw with the real render passes instead of `RenderDebugTileMap` + hand-drawn markers, so what the editor shows is what plays. Whole-level residency is what makes this affordable.
- Prefabs: capture a selected rect into a `PrefabDef`, stamp a registered one back. Both are plain `LevelData` ops, so only the export is new — a JS literal for `contentPrefabs`, mirroring the level export → `datafiles/levels/` workflow.
- `meta.settlement` authoring: the editor round-trips a level's settlement whole, so it is only reachable by hand-editing `meta` (zone authoring itself has no consumer left — no channel is authored anywhere).

## Media

Names predating the naming rules are grandfathered — never rename as a sweep; migrate one only when already touching it.

- Grandfathered: the UI glyphs/lobby art (`vecCheck`/`vecPlay`/`pixUiBox`/…), spare icons (`pixApple`), and the `pixTile16`/`pixTileCornerRough` autotile sets
- Unwired spares: `pixTileFenceSquare`/`pixTileFenceRound` (the blob4 fence sheets kept for debugging — the fence is `RenderFence` geometry now), `wooden_bed_simple`
- A dedicated plan-view TOP pattern per wall material, if the shared face texture ever reads wrong

## Verification

- Test scenes for fast debugging
- Cover what only a running frame can catch (system ordering, grid/collider sync); leave one-off probes on the existing `Log`/`Screenshot`/`entities.dump` harness
