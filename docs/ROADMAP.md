# Roadmap

Where the project is going: what is being worked on now, what is known broken, and what is planned. Contracts live in the code (CLAUDE.md → Comments law 2); this file holds only intent.

## Current Works

One concern per pass: each pass applies a single mechanical rule across all of `scripts/`, sized so one session can finish and verify it — never every rule on one file. A file touched by several passes is accepted churn. A pass too large for one session splits by pillar (Core → Gameplay → GemsUI → Demo), never by mixing concerns.

### Tools Review

`tools/` is self-contained (never imported by the game; each tool owns a README). Pending, per tool: fix the docs, then overhaul as needed.

### Media Rename

Media names predating CLAUDE.md → Media Asset Naming are grandfathered — never rename as a sweep; migrate one only when already touching it (mechanics: CLAUDE.md → Resourcetool). The set: the UI glyphs/lobby art (`spr_check`/`spr_play`/`spr_uibox`/…), unused spare icons (`spr_apple`), the `spr_fenceSquare`/`spr_fenceRound` sheets, and the `spr_tile16`/`spr_tilecornerRough` autotile sets.

## Known Issues

Issues noticed in passing or by a review batch, recorded here and deliberately left unfixed until scheduled, grouped by kind (an entry straddling kinds files under its primary defect):

### Encapsulation Breaches

- **`RenderMesh`'s underscore members are the shared-light seam**: `RenderBillboard`/`RenderWalls`/`RenderTileMap`/`TerrainStream` call `opt.lights._setupLights` and read `_litOk`/`_uUseTex`/`_uNormal` — four passes depend on "private" members. Promote the seam to public names so the underscore rule stays honest.
- **`Grid` consumers bypass its API**: `NavGrid` writes `grid.data` directly because `clear(value)` reallocates — bless `.data` in the JSDoc or add an in-place fill.
- **`RpgWorldOverlay._rarityColor` is an underscored public seam**: `InvTable`, `CraftingUI`, `WeaponModUI`, and `RpgInventoryUI` all call it, and the file's own header admits it's shared. Promote it to a public name on a neutral owner (`InvTable` — nothing about it is world-overlay).
- **Debug sections reach into module internals**: the Perf entity count computes `ids.next - ids.freeIndices.length` off the id pool and the Log section reads `Log._lines` — give `Entity` a `count()` and `Log` a `count()` (or bless the fields) so Core/Debug stops depending on privates.

### Typedef Gaps

- **`entities.broadphase` is an undeclared field**: assigned by `RpgMap`, read by `SeparationSystem`/`TriggerSystem`, declared nowhere; its sibling store-level config `gravity` goes through `EntityOpts`. Declare it on the constructor with its contract.
- **`TileType` is defined twice**: `LevelGrid`'s `@typedef` shadows the `TileType` class for the checker and omits the `null` → `Infinity` cost rule. Drop the typedef, cite the class.
- **`InventorySlot` hides its gun fields**: `EquipmentSystem`'s reload/compose path and `PlayerSystem`/`WeaponModUI` read-write `slot.ammo`/`slot.rounds` on weapon-instance slots, but the `Inventory` typedef — the shape's one definition — declares neither. Declare them as optional gun-instance fields beside `uid`/`mods`.
- **Kit typedefs written as line comments are invisible**: `Favorites`, `Merchant`, `StatusEffects`, `Hunger`, `Thirst`, `Drowsiness`, `Playable`, and `Hotbar` carry their `@typedef` in `//` comments, so the checker never sees shapes the ECS invariant calls the type system. Convert to `/** */` blocks.
- **`QuestLog`'s rewards typedef contradicts every live site**: it declares `rewards` as `Array<{itemId,qty}>`, but the content (`RpgQuests`) authors `{ items: [...] }` and the consumer (`RpgProgression.applyReward`) reads `reward.items` — the object shape is the real contract (which also makes `complete`'s `?? {}` fallback correct). Fix the `@property`. The typedef also declares a `desc` no content authors while omitting `objLabel` — the field every def carries and `UIQuestTracker` reads.
- **`Brain.baseColor` is undeclared**: `CombatAI.attach` writes it and `_tint` blends the aggro wash from it, but the otherwise-exhaustive `Brain` typedef omits it. Declare it.

### Stale Comments

- **Comments cite nonexistent APIs**: `Color.merge` points at `Tween.approachColor` (never written — the idiom is per-channel `Tween.approach`); GMRT.md and `RenderCloudShadow` cite `Utils.hash2` where the global is bare `hash2`; `Profile` twice points at `Achievement.evaluate` (the engine deliberately has no evaluator — `RpgAchievements.report` is the trigger).
- **Stale analog comments in Core/Input**: `InputAxis` claims no action binds an axis and `Input` calls its export/import scaffolding unused — `PlayerSystem` binds four stick axes and reads `value()`, and `InputPreset` round-trips the export. Fix both headers.

### Dead & Caller-less Code

- **Caller-less Core/Util members**: `Query.farthest`, `Color.alpha`, `rem`, and `Settings.isModified` have no consumers; `isModified` also compares nested values by reference, so a set nested value always reads modified.
- **`World.update`/`World.reset` are unwired scaffolding**: zero callers — `sceneRpg` still drives `WorldClock`/`WorldEvents` directly — and `World.update` carries the Core → Gameplay edge (`WorldClock`). Wire the phase-2 routing (clock injected, not named) or drop the methods until it lands.
- **`Collision.mask` is dead**: typed `Set|null`, authored `null` at every spawn site, read by no system — and a live `Set` would be silently nulled by the Json save path (the no-`Set` serialization invariant). Drop the field, or retype it serializable (bit flags) when masks become real.
- **`Entity.import` and `Entity.register` have no callers**: saves store `entities.export()` but restore by reading entities out, and `add` auto-registers. `EntityData.import` also silently drops snapshot tokens the store never registered — keep the pair only with that guard, else drop it.
- **`ZoneSystem` is dead machinery**: nothing calls `update`/`zoneOf`/`entitiesIn` — `sceneRpg` deliberately bypasses the sweep ("direct lookup beats it"), `ZoneMap._inside` exists only to serve it, and ARCHITECTURE.md still names it the zone driver. Wire it in or drop the module (plus `_inside` and the index line).
- **Caller-less Core/Level members**: `TileLayer.from`, `ChunkManager.centerChunk`, and `ChunkManager.activeCount` have no consumers.
- **`Input.sensitivity`/`deadzone` are dead config**: exported to `input.json` and imported back, but nothing reads them — `InputAxis.value()` returns the raw stick with no deadzone applied. Apply the deadzone in `value()` or drop both fields.
- **`InputAction.unbindButton`/`unbindAxis` are dead**: `UIRebind` remaps by assigning `action.buttons[0]` directly, so the unbind pair has no callers.
- **`UIMinimap`/`gemsMinimap` are dead**: the factory has no callers and is `UIMinimap`'s only constructor site — `RadarArrows` is the shipped radar. If kept as a spare, its fixed `target` id also predates the live-queries invariant (take a getter, or resolve `CameraFocus`).
- **`gemsWindow` is unwired and carries `UIDrag`/`UIResize` with it**: the draggable-window factory is self-declared kit inventory (`gemsOverlay` is what the RPG windows use) and is the sole constructor site of Core's `UIDrag` and `UIResize` — a three-module spare chain like `UIMinimap`/`gemsMinimap`. Wire a consumer or keep all three as deliberate spares.
- **`Projectile`/`ProjectileSystem` run with zero spawn sites**: `RpgMap`'s pipeline ticks the system and `RpgWorldOverlay` queries bullets every frame, but nothing ever adds a `Projectile` — both files admit "retained for grenades". Unregister the pair until a spawner exists (re-adding is one line), or accept the idle queries explicitly at the pipeline site.
- **The settlement inhabitant/capability layers have no consumers**: `SettlementSystem` is fully caller-less (`RpgSpawn` attaches `Resident` directly, bypassing `assign`), the `SettlementComponent` registry is registered by `RpgContent` and read by nothing, and `Settlement.addComponent`/`removeComponent`/`expand` are self-declared seeds for the Farming/raid features. The lands half (`found`/`at`/`ownerAt`/`all`/`centroidWorld`) is live. Route `RpgSpawn` through `SettlementSystem.assign` so the seam is real; keep the rest as deliberate spares.
- **Caller-less kit enumerators**: `Status.all()` and `FactionSystem.all()` have no consumers — registry-parity members kept without a reader.

### API Shape & Consistency

- **`File`'s async members break the verb family**: `saveAsync`/`loadAsync` belong as `writeBufferAsync`/`readBufferAsync` beside `read`/`readBuffer`; both are caller-free (parked on GMRT #15223), so the rename is free. `writeBuffer` also returns an unconditional `true` it never verifies.
- **`Query.hasCollision` duplicates `has: Collision`**: drop the opt and migrate its one caller (`RpgInteractions`).
- **`MotionPlanner.plan`'s algorithm selector is speculative**: `MP_ALGORITHM` holds one value and the sole caller passes none — fold to `plan(start, goal, opt)` until a second algorithm exists. Planning with no grid bound should `Log.error`, not return the `[]` that also means unreachable.
- **`Entity` argument order is split**: `get(Component, id)` reads one way, `add(id, Component, data)`/`detach(id, Component)` write the other. Normalizing the hottest API in the codebase is a full mechanical pass — decide the order first.
- **`LevelManager`'s registry half predates the rename sweeps**: `worldOf(mapId)` returns an `Entity` store (`entitiesOf`), `_levels` holds map entries beside `_all`'s level entries, and `take`/`put`/`transfer` return null / -1 / id-or-snapshot across one family.
- **One accessor against the house style**: `UIInput.get focused()` is the kit's lone getter where `UISelect`/`UIDropdown`/`UITable` document "methods, not accessors" — convert it or soften the note.
- **`SpriteMeta.fit(scale, sprite)` inverts the sprite-first parameter order** of its siblings `density`/`anchor`; four call sites to swap.
- **Singleton method style is split in Core/Util**: `Log`/`Settings`/`SaveData` self-reference via `this`, the rest via their global name — normalize as a mechanical pass.
- **`gemsDropdown` drops the `onChange` its sibling honors**: the Settings-bound pair split — `gemsSelect` fires `opts.onChange` after `Settings.set`, `gemsDropdown` ignores it — and `gemsDropdown` has zero callers; `SystemMenu`'s resolution row hand-rolls the same Settings binding over `gemsDropdownCustom` because it needs the apply hook. Pass `onChange` through and the hand-roll folds into the factory.
- **`gemsSlider` is the kit's only positional signature**: `(key, min, max, step, opts)` forces live callers to pass a placeholder (`SystemMenu`'s `gemsSlider(key, 0, 1, undefined, {…})`) where every sibling control takes `min`/`max`/`step` in the opts bag (`gemsStepper`). Fold them into opts.
- **`gemsRoot` redirects `insertChild` instead of exposing the host**: the kit idiom is a named content property (`gemsScroll.scrollBody`, `gemsOverlay.body`); `gemsRoot`'s capped mode instead monkey-patches the wrapper's `insertChild` to the inner column, leaves `removeChild` un-redirected (a remove targets the wrapper and silently misses), and assigns a `.content` nothing reads. Expose the column like the siblings do.
- **`gemsSelectCustom` lost its doc line and its sizing**: its header ("Panel-backed cycling select…") sits stranded above `gemsFieldPanel`, and it builds `gemsFieldPanel({})` where every sibling field control forwards `height`/`width` — a select can't be sized (latent; callers pass only `tooltip`). Re-home the comment and forward the opts.
- **`CollectibleSystem` is misnamed**: its only member is `hitSpike` (spike-hazard detection) — no collectible exists in the platformer. Rename for what it does, or fold the check into `EnemySystem`/the scene.

### Duplication

- **Free-run sprite animation is duplicated in two draw passes**: `RenderEntity` and `RenderBillboard` both advance `Visual.time`/`subimg` in draw, on `Time.raw` — one advance site would do, and the clock choice deserves a decision (today a paused sim keeps world sprites animating).
- **The pitched view-rect rule is implemented three ways**: `CameraFollow`'s clamp and `RenderMesh`'s light cull stretch the N-S reach by `1/cos(pitch)`; `RenderGrid`/`RenderDebugTileMap` cull without it and under-cover under pitch. Give `Camera` a ground-rect helper owning the rule and point all four at it.
- **Singleton panel chrome is triplicated**: `Dialogue`/`Toast`/`Tooltip` each hand-roll the same rounded panel + border draw and hard-code the same palette hexes, invisible to `GemsTheme` — a shared `UIDraw` panel helper with theme-sourced defaults would let a palette swap reach the singletons.
- **The `readOnly` capture rule is duplicated**: `UICheckbox` and `UISlider` each hand-roll the same "hover captures, press must not latch" return; a `readOnly` mode on `UITrigger` would own it.
- **Ten hand-rolled registries across the kit and Demo**: `Item`/`Manufacturer`/`Rarity`/`Recipe`/`FactionSystem`/`Status`/`QuestLog`/`SettlementComponent`/`InteractAction`/`Achievement` each re-implement the string-keyed registry + insertion-order array (the #15095 index-loop idiom) with drifting member sets and split storage (Map vs plain object) — `Recipe` lacks `has`/`all`, `Rarity` alone carries a caller-less `import`/`export` pair and no file header. With inheritance off the table, consolidate via a composed registry helper or at least align the family and drop the dead pair.
- **`LevelSerializer._enc` is a second hand-rolled encoder**: a `pretty` option on `Json.encode` (2-space indent, scalar arrays inline) would fold the level-file encoder into the codec.
- **The quest turn-in ceremony is duplicated in `sceneRpg`**: `_tryTurnIn` and `_npcActivate` each run the same complete → applyReward → counter-bump → achievement-report sequence. Fold into one `_completeQuest(qid)` so the two paths can't drift.
- **The double-click gesture is triplicated in Demo UI**: `StorageUI._click`, `TradeUI._click`, and `RpgInventoryUI._onGridSelect` each hand-roll the same 350ms same-target re-click detector with its own identity-key scheme. One shared helper would own the threshold and the uid-over-itemId identity rule.
- **Demo UI hardcodes the theme's gold**: `"#ffd166"` appears 17 times across `InvTable`/`TradeUI`/`StorageUI`/`RpgInventoryUI`/`sceneRpg`/`sceneUIKit`/`FloatingText` — duplicating the palette's `warn` key, so the light palette's darkened warn never reaches these labels. Read `GemsTheme.warn` (or add a dedicated gold key).

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
