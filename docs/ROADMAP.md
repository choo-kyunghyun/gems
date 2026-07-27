# Roadmap

Where the project is going: what is being worked on now, what is known broken, and what is planned. Contracts live in the code (CLAUDE.md → Comments law 2); this file holds only intent.

## Current Works

One concern per pass: each pass applies a single mechanical rule across all of `scripts/`, sized so one session can finish and verify it — never every rule on one file. A file touched by several passes is accepted churn. A pass too large for one session splits by pillar (Core → Gameplay → GemsUI → Demo), never by mixing concerns.

### Code Review (file-by-file)

Review batches from the coupling analysis (270 scripts, ~35.4k LOC; reference graph of `globalThis` exports vs. usages). Ordered bottom-up so each batch depends only on already-reviewed code; each batch is review-only — the renames and comment sweeps land first. Check batches off as they finish.

1. [x] Core utilities: Core/Util — highest fan-in in the project (`Log`, `Color`, `Time`, `AABB`, `File`); everything sits on these
2. [x] ECS heart: Core/Component, Core/Entity, Core/World — `World.update` → `WorldClock` (Gameplay) upward edge; `LevelManager` → `LevelRegistry` (Demo)
3. [x] Systems + levels: Core/System, Core/Level — built-in systems, `LevelGrid`/`TileEdit`/zones
4. [x] Camera + input: Core/Camera, Core/Input — small, self-contained
5. [ ] Renderer: Core/Render — `RenderMesh` queries the `Light` token (Gameplay)
6. [ ] UI infra: Core/UI — `UIElement` base, `I18n` (28 dependents), `UIPointer`; `VirtualKeyboard` → GemsUI upward edge
7. [ ] UI widgets: Core/UI/Element (plain widgets) — half of the biggest folder
8. [ ] UI singletons: Core/UI/Element (heavy singletons) — `SystemMenu` → GemsUI + `sceneLobby` upward edges
9. [ ] GemsUI kit: GemsUI — theme + the three factory buckets
10. [ ] Gameplay economy: Items, Inventory, Equipment, Crafting, Trade — `Item`/`Inventory` are 18–21-fan-in hubs; `EquipmentSystem` → `StatModel` (Demo) upward edge
11. [ ] Gameplay simulation: Combat, Status, Survival, Environment, Settlement, Squad, Animation, Lighting, Interaction, NPC, Quest — `ConsumableSystem`/`StaminaSystem`/`StatusSystem` reference Demo's `Stats` token directly
12. [ ] Demo systems + content: Demo/System, Demo/Content, Demo/Component — `RpgCombat`, `SaveGame`, `PlayerSystem`, `CombatAI`, content registries
13. [ ] Demo scenes: Demo/Scene, Demo/Editor, Demo/Platformer, Demo/Lobby + `obj_game` — highest fan-out (`sceneRpg` 88 deps, `RpgMap` 62); review last-ish
14. [ ] Demo UI: Demo/UI — `RpgInventoryUI` (41 deps), HUD, Trade/Storage/Crafting/WeaponMod UIs
15. [ ] Debug + audio: Core/Debug, Core/Audio — absent from the original coupling-analysis split

`tools/` is self-contained (never imported by the game) — review separately if at all.

### Media Rename

Media names predating CLAUDE.md → Media Asset Naming are grandfathered — never rename as a sweep; migrate one only when already touching it (mechanics: CLAUDE.md → Resourcetool). The set: the UI glyphs/lobby art (`spr_check`/`spr_play`/`spr_uibox`/…), unused spare icons (`spr_apple`), the `spr_fenceSquare`/`spr_fenceRound` sheets, and the `spr_tile16`/`spr_tilecornerRough` autotile sets.

## Known Issues

Issues noticed in passing or by a review batch, recorded here and deliberately left unfixed until scheduled:

- **`UITable._fit` truncation is O(n²)**: it re-measures the whole string per removed character (`string_width` in a shrink loop). Harmless at current cell lengths; switch to a binary search / incremental measure if long text cells ever land in a table.
- **`WorldEvents.update` lacks the due-count snapshot its comment claims**: a handler that schedules a follow-up at `<= now` re-enters the drain loop the same frame, so a repeat scheduler hangs the game. Latent — `Trader` (the only consumer) only schedules future hours. Implement the snapshot or restate the comment as a handler constraint.
- **`File`'s async members break the verb family**: `saveAsync`/`loadAsync` belong as `writeBufferAsync`/`readBufferAsync` beside `read`/`readBuffer`; both are caller-free (parked on GMRT #15223), so the rename is free. `writeBuffer` also returns an unconditional `true` it never verifies.
- **`Query.hasCollision` duplicates `has: Collision`**: drop the opt and migrate its one caller (`RpgInteractions`).
- **Caller-less Core/Util members**: `Query.farthest`, `Color.alpha`, `rem`, and `Settings.isModified` have no consumers; `isModified` also compares nested values by reference, so a set nested value always reads modified.
- **`MotionPlanner.plan`'s algorithm selector is speculative**: `MP_ALGORITHM` holds one value and the sole caller passes none — fold to `plan(start, goal, opt)` until a second algorithm exists. Planning with no grid bound should `Log.error`, not return the `[]` that also means unreachable.
- **Comments cite nonexistent APIs**: `Color.merge` points at `Tween.approachColor` (never written — the idiom is per-channel `Tween.approach`); GMRT.md and `RenderCloudShadow` cite `Utils.hash2` where the global is bare `hash2`.
- **`LevelSerializer.load` contradicts GMRT.md on `JSON.parse`**: its comment claims parse drops fields / faults on large nested input; `Json` and GMRT.md hold that only stringify faults. Probe and settle — if real it belongs in GMRT.md and threatens `SaveGame.load`. A `pretty` option on `Json.encode` would also fold `LevelSerializer._enc`, the second hand-rolled encoder, into the codec.
- **Persistence failures are silent**: `Json.encode` still returns its truncated output after a step-cap abort (`SaveGame` writes it as a manifest); `SaveData.load`/`Settings.load` swallow parse errors with no log.
- **`World.update`/`World.reset` are unwired scaffolding**: zero callers — `sceneRpg` still drives `WorldClock`/`WorldEvents` directly — and `World.update` carries the Core → Gameplay edge (`WorldClock`). Wire the phase-2 routing (clock injected, not named) or drop the methods until it lands.
- **`LevelManager._make` reaches into Demo's `LevelRegistry`**: Core scans `LevelRegistry._entries` (a private field, cross-pillar) for a display label. Invert the seam: registrants hand the label to the manager (entry field or a resolver hook wired at boot).
- **`Collision.mask` is dead**: typed `Set|null`, authored `null` at every spawn site, read by no system — and a live `Set` would be silently nulled by the Json save path (the no-`Set` serialization invariant). Drop the field, or retype it serializable (bit flags) when masks become real.
- **`Entity.import` and `Entity.register` have no callers**: saves store `entities.export()` but restore by reading entities out, and `add` auto-registers. `EntityData.import` also silently drops snapshot tokens the store never registered — keep the pair only with that guard, else drop it.
- **`Entity.flush` trusts stale ids**: `storage.clear` runs before any liveness check, so a stale queued `remove` wipes the recycled slot's new owner (`ids.free` then no-ops). Guard with `ids.isValid` plus a warn.
- **`Entity` argument order is split**: `get(Component, id)` reads one way, `add(id, Component, data)`/`detach(id, Component)` write the other. Normalizing the hottest API in the codebase is a full mechanical pass — decide the order first.
- **`entities.broadphase` is an undeclared field**: assigned by `RpgMap`, read by `SeparationSystem`/`TriggerSystem`, declared nowhere; its sibling store-level config `gravity` goes through `EntityOpts`. Declare it on the constructor with its contract.
- **`LevelManager`'s registry half predates the rename sweeps**: `worldOf(mapId)` returns an `Entity` store (`entitiesOf`), `_levels` holds map entries beside `_all`'s level entries, and `take`/`put`/`transfer` return null / -1 / id-or-snapshot across one family.
- **`ZoneSystem` is dead machinery**: nothing calls `update`/`zoneOf`/`entitiesIn` — `sceneRpg` deliberately bypasses the sweep ("direct lookup beats it"), `ZoneMap._inside` exists only to serve it, and ARCHITECTURE.md still names it the zone driver. Wire it in or drop the module (plus `_inside` and the index line).
- **`TriggerSystem` sweeps statics the broadphase can't hold**: it rebuilds `entities.broadphase` (cell 96) with every collider, but merged wall/terrain rects span many cells — the center-bucket contract (cell size > largest entity) breaks, so sensor-vs-wall pairs are missed inconsistently and matched ones only push noise ids into `hits`. Exclude kinematic solids from the trigger sweep.
- **`TileType` is defined twice**: `LevelGrid`'s `@typedef` shadows the `TileType` class for the checker and omits the `null` → `Infinity` cost rule. Drop the typedef, cite the class.
- **Prefab-stamped zones share one `data` object**: `stamp`/`apply` pass the def's `data` by reference into every `Zone` they define, so mutating one zone's payload (a settlement rename/owner change) aliases its siblings and the registry def — until a save round-trip mints fresh objects and the aliasing silently disappears. Deep-copy `data` at define time.
- **Caller-less Core/Level members**: `TileLayer.from`, `ChunkManager.centerChunk`, and `ChunkManager.activeCount` have no consumers.
- **Camera wheel-zoom ignores the UI**: `_cameraFollowOnUpdate` reads `mouse_wheel_up/down` raw with no over-UI gate (the UI consumes the same wheel via `UIPointer.wheel`), so scrolling a hovered list also zooms the world behind it. Gate the zoom on the pointer being over UI, or route the camera through `UIPointer.wheel`.
- **`Input.sensitivity`/`deadzone` are dead config**: exported to `input.json` and imported back, but nothing reads them — `InputAxis.value()` returns the raw stick with no deadzone applied. Apply the deadzone in `value()` or drop both fields.
- **Stale analog comments in Core/Input**: `InputAxis` claims no action binds an axis and `Input` calls its export/import scaffolding unused — `PlayerSystem` binds four stick axes and reads `value()`, and `InputPreset` round-trips the export. Fix both headers.
- **`InputAction.unbindButton`/`unbindAxis` are dead**: `UIRebind` remaps by assigning `action.buttons[0]` directly, so the unbind pair has no callers.
- **`Grid` consumers bypass its API**: `NavGrid` writes `grid.data` directly because `clear(value)` reallocates — bless `.data` in the JSDoc or add an in-place fill.
- **`SpriteMeta.fit(scale, sprite)` inverts the sprite-first parameter order** of its siblings `density`/`anchor`; four call sites to swap.
- **Singleton method style is split in Core/Util**: `Log`/`Settings`/`SaveData` self-reference via `this`, the rest via their global name — normalize as a mechanical pass.

## Planned Features

### Media

- Redraw the 16 px fence sheet at 32 (hand-drawn, no generator; `SpriteMeta density: 0.5` carries it meanwhile). `spr_fenceRound`, `stand`, `wooden_bed_simple` remain unwired spares.
- A dedicated plan-view TOP pattern per wall material if the shared face texture ever reads wrong.

### UI

- Killfeed UI
- Click cue on non-button widgets (only `UIButton`/`UINav` activation cues today — a mouse click on a slider/checkbox/list is silent)
- UI concept: Smart HUD

### Gameplay

- Modular turret
  - Auto turrets fire mounted weapons
  - Mountable turrets
- Explosive like grenade and mine (`snd_explosion_large` is its reserved SFX)
- Minify furnitures
- Settlement and outpost (foundation done — Gameplay `Settlement`: player-owned territory zone with Name/Faction, build mode gated to owned land; outpost variant + settlement-management UI remain)
- Farming and fishing (Farming layers on a settlement's lands)
- Gamepad reloading
- More role-playing optional components
  - Biological sex (display as XX and XY)
  - Entity age
- Gacha capsule with new UI
- Raid event: Defend the settlement (`mus_ambient_emergency` is its reserved BGM)
- Radio

### Build Mode

- Blueprint UI
- Drag to select

### Editor

- Prefabs

### Engine

Deferred chunk-streaming work (engine is `ChunkManager`):

- Per-chunk build persistence (player builds inside streamed chunks)
- On-disk chunk saves (beyond the in-session cache + save-game delta)
- Throttled distant ticks (LOAD-ring entities simulate at low rate)

### Verification

- A dev-only test level satisfying the `Level` contract: builds a real `Entity` store, steps the actual systems, `Log.error`s failed assertions, then ends the run — so `gm-cli run` plus reading `game.log` is the whole loop. Registered in `LevelRegistry`, launched from `sceneLobby`'s dev launcher.
- Assertions stay in that one level, never as per-module `test()` methods: a single deletable compilation unit costs each module nothing, keeps the shipped API surface clean, and stays clear of the per-unit budget defects (GMRT.md → Build).
- Cover what only a running frame can catch (system ordering, `Pipeline` composition, grid/collider sync); leave one-off probes on the existing `Log`/`Screenshot`/`entities.dump` harness.
