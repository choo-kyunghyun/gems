# G.E.M.S. Architecture

Detailed architecture reference for **G.E.M.S.**, imported into context by [CLAUDE.md](CLAUDE.md) (via its `@ARCHITECTURE.md` line), so it is always loaded alongside it. See CLAUDE.md for the project overview, build & run, asset-creation workflow, code style, and the **GMRT-Safe Idioms** that always apply — those live there (kept always-in-context) and are referenced by name in code comments.

## Demo Layer — `obj_game` & `Scene`

`obj_game` is the unified controller — it drives both global system ticks and scene lifecycle.

```
Create_0 → display/GPU setup; Log.clear/info; Settings defaults + load; I18n.load for `Settings.language`; opens SCENES.lobby
Draw_0   → draw_clear(background), scene.draw()
Step_0   → Time.update(), SlotDrag.poll(), UI.update(), SlotDrag.update(), SystemMenu.update(this), UINav.update(), Dialogue.update(), pending scene → SceneTransition.start, SceneTransition.update(), scene.step() [skipped while SystemMenu open, except a one-frame Step], Log.flush()
Draw_75  → UI.draw(), UINav.draw(), SlotDrag.draw(), Tooltip.draw(), Toast.draw(), Dialogue.draw(), SceneTransition.draw(), F5 screenshot
CleanUp  → Log.info("game end"); scene.destroy() (before UI.destroy — it removes the scene's UI roots), UI/Input/I18n cleanup; Log.flush() last (Step_0's flush won't run again, so teardown logs would otherwise be lost)
```

**`Scene`** (`scripts/Scene/Scene.js`) is the base class for all demo scenes (`label`, `create()`, `step()`, `draw()`, `destroy()`). Scenes are **factory functions** returning a fresh instance each time they open. `create(openScene)` receives the navigation callback; `destroy()` tears down UI and resources.

**Scene navigation**: call the `openScene(factory)` callback to queue a transition (applied after the current UI update completes). The only **built-in scene** (`scripts/sceneLobby/sceneLobby.js`) is `SCENES.lobby` — the merged **title + lobby** landing scene the app boots into: a G.E.M.S. header, a **tabbed** scene catalogue (the registry categories grouped into Games / Tech / Demos tabs), and a footer of global actions (Settings → SystemMenu, Credits → SystemMenu's About tab, Quit). There is no separate title or credits scene, and Settings/Pause are not scenes — they're the **`SystemMenu`** overlay (see Genre UI managers below).

**`SceneRegistry`** (`scripts/demo/demo.js`) is the lobby catalogue. Register at the top level of a scene's script:

```js
SceneRegistry.add(() => new MyScene(), {
  label: "My Scene",
  category: "SCENE_CAT_FOO",
});

class MyScene extends Scene {
  label = "My Scene";
  create(openScene) {
    /* build UI; openScene(SCENES.lobby) to go back */
  }
  destroy() {
    /* remove UI, clean up */
  }
}
```

`SceneRegistry.byCategory()` returns entries grouped by category string. To add a scene: create the script asset (see Asset Creation), define the class, then `SceneRegistry.add(...)`.

**GemsUI kit** (`scripts/GemsTheme`, `GemsContainers`, `GemsWidgets`, `GemsControls` — split out of `demo.js`, which now holds only `SceneRegistry` + `teardownScene`): a themed factory library so scenes build UI declaratively instead of hand-wiring `UIElement`/`UIPanel`/`UIText`. Every factory is assigned via `globalThis.X = function X(…)` (not a bare declaration) and the kit is split across small files — both to dodge the GMRT large-file global-hoisting fault (see GMRT-Safe Idioms). All visual constants live in **`globalThis.GemsTheme`** (colors as hex strings, geometry as numbers); the `gems*` free functions parse + compose them. Containers: `gemsRoot(opts?)` (full-screen scene root), `gemsList(opts?)` (vertical stack), `gemsGrid(opts?)` (horizontal wrap row), `gemsPanel(opts?)`/`gemsCard(opts?)` (rounded panel; card adds gradient+border+shadow), `gemsHeader(title, opts?)` (title bar), `gemsSection(title, opts?)` (titled card with divider), `gemsRow(label, control, opts?)`, `gemsDivider(opts?)`. Widgets: `gemsLabel(label, opts?)`, `gemsHint(label, opts?)` (one-line help text on a readable card — use instead of a bare `gemsLabel` for overlays that would otherwise float over a scene's render), `gemsButton(label, onClick, opts?)` (`opts.primary` → accent CTA), `gemsIconButton(sprite, onClick, opts?)`, `gemsToggle(label, getValue, onToggle, opts?)` (renders `label: ON/OFF` as a button), `gemsCheckbox(label, getValue, onToggle, opts?)` (visual toggle; `opts.style` `"check"`/`"switch"`), `gemsProgress(getValue, opts?)` (non-interactive 0–1 bar; `opts.label` centered), `gemsSlider(key, min?, max?, step?, opts?)` + `gemsSelect(key, items, opts?)` (Settings-bound), `gemsSelectCustom(items, index, onChange, opts?)`. **Tooltips**: `gemsTooltip(element, label, opts?)` attaches a hover `UITooltip` (at index 0) and returns the element; every interactive widget factory also takes `opts.tooltip` (string or `() => string`) as a shortcut. `label`/`onText`/`offText` accept a string or `() => string` (live `I18n.textRef`); color opts accept a `GemsTheme` key, hex string, or raw color int. Styling lives only in `GemsTheme` + `UIPanel` — `UIPanel` options: `color2` (an edge tint; `draw_roundrect`'s two colors run **center→edge/radial**, not top→bottom), `border`/`borderColor`, soft multi-pass `shadow`/`shadowColor`/`shadowAlpha`, and `highlight`/`highlightColor`/`highlightAlpha` (inner top-bevel sheen) — all default off, so existing callers are unchanged. `UIButton` eases color/border-glow/shadow between hover/press states (`Time.raw` lerp — UI ignores `Time.scale`); `UISlider`/`UISelect`/`UIProgress`/`UICheckbox` render directly in `onDraw` (no absolute-positioned child panels — those relied on the unreliable per-frame `flexpanel` style setters, bug #15065) — `UISelect` shows `< value >` arrows and steps back/forward by click side. For the flexpanel property reference run `gm-cli manual read "Flex Panel Struct Members"`; the GMRT runtime-mutation rule (#15065) is a GMRT-Safe Idiom in CLAUDE.md. **`teardownScene(scene)`** releases the `world`/`renderer`/`camera`/`ui` a scene holds on `this`, in dependency order (missing fields skipped) — call it from `destroy()` after releasing scene-specific resources (controllers, levels).

## ECS Core — `World`

`World` (`scripts/World/World.js`) is the instance-based ECS core, owning all component storage and the generational ID allocator. Each scene holds its own as `this.world` (there is no `WORLD` global). **`Entity` is deprecated** — its functionality moved to `World`.

```js
const world = new World(maxEntities, tickrate, opts); // opts: { gravity? } overrides GravitySystem.strength

// Entity lifecycle
const id = world.create(); // allocate generational ID
world.remove(id); // mark for removal (deferred)
world.flush(); // commit queued removals
world.isValid(id); // generational validity check

// Component storage
world.register(Position); // allocate storage (optional; add auto-registers)
world.add(id, Position, { x: 0, y: 0, z: 0 }); // set data
world.get(Position, id); // → data object or undefined
world.detach(id, Position); // remove one component

world.query(Position, Velocity); // → ids that have ALL listed components
world.forEach([Position, Velocity], fn); // calls fn(id) per match, no id array allocated

// Fixed-rate tick
const ticks = world.update(); // # ticks to run this frame; advances accumulator, computes alpha
world.alpha; // [0, 1) interpolation factor for rendering
world.maxTicks; // tick cap per frame (default 5) — spiral-of-death guard:
// under overload the sim slows instead of freezing

// Snapshot
world.export(); // plain object, components keyed by string token, sparse entries
world.import(s); // restores ids + registered components; unknown keys ignored
```

## `IdPool`

`IdPool` (`scripts/IdPool/IdPool.js`) is the generational ID allocator owned by `World` as `world.ids`. IDs encode index (lower 20 bits) + generation (upper 12 bits). Static helpers: `IdPool.getIndex(id)`, `IdPool.makeId(index, gen)`, `IdPool.getGeneration(id)`. Instance methods (`world.ids.*`): `alloc()`, `free(id)`, `isValid(id)`, `reset()`, `export()`, `import()`.

## Component Pattern

Components are **string tokens** — a global name used as a `Map` key and for serialization. Data shape is defined at the call site; there are no static arrays, `defineComponent`, or static component classes (all deprecated).

```js
globalThis.Position = "Position";
/** @typedef {Object} Position @property {number} x @property {number} y @property {number} z */
// usage: world.add(id, Position, { x, y, z })
```

## System Pattern

Systems are **plain objects** with an `update(world)` method:

```js
globalThis.MovementSystem = {
  update(world) {
    for (const id of world.query(Position, Velocity)) {
      const pos = world.get(Position, id);
      const vel = world.get(Velocity, id);
      pos.x += vel.x * world.tickDuration;
      pos.y += vel.y * world.tickDuration;
    }
  },
};
```

On-demand utility systems (e.g. cursor methods on `PathfindingSystem`) expose named methods instead of `update(world)`.

## Fixed-Rate Simulation (ECS Scene Pattern)

Scenes running an ECS simulation dispatch systems explicitly inside `step()`:

```js
step() {
  const ticks = this.world.update();
  for (let t = 0; t < ticks; t++) {
    InterpolationSystem.snapshot(this.world); // first: record pre-move positions for render lerp
    GravitySystem.update(this.world);
    SolidSystem.update(this.world);       // integrates + resolves solid bodies
    SeparationSystem.update(this.world);  // pushes overlapping bodies apart
    StateSystem.update(this.world);
    LifetimeSystem.update(this.world);
    this.world.flush();
  }
}
draw() { this.renderer.draw(this.world); }
```

Genre scenes compose these into a **`Pipeline`** (`scripts/Pipeline/`): `this.physics = new Pipeline().add(SystemA).add(stepFn)`, then `this.physics.update(world)` each tick. A step is any `{ update(world) }` object or a bare function. Per genre: platformer `Gravity → clampFall → SolidSystem`; top-down `SolidSystem → ProjectileSystem`; RTS `SolidSystem → SeparationSystem`.

**Motion integrators are exclusive per body**: `MovementSystem` integrates _free_ movers (no collision response), `SolidSystem` is move-and-collide for solid bodies, `ProjectileSystem` is move-and-raycast for projectiles. A given mover is integrated by exactly one of them.

**`Time`** (`scripts/Time/Time.js`): `Time.delta` (scaled seconds), `Time.raw` (wall-clock), `Time.scale` (time dilation). Updated by `obj_game` in `Step_0` before `scene.step()` — always available in scene code.

## Genre Controllers & Template Gameplay Systems

The Core systems above are genre-agnostic. A playable genre scene layers a **controller** plus **gameplay systems** on top — these live in the genre's folder (`Platformer`/`RTS`/`Map` under **Showcase**; the **TopDown** genre is merged into the top-level **RPG** folder alongside the shared RPG layer) and are orchestrated by the scene's `step()`, not auto-run by `World`.

**Genre controllers** (`PlatformerController`, `TopDownController`) own player input registration + entity setup and expose a three-phase lifecycle, not an `update(world)`. **`TopDownController`** (the RPG genre) spawns its player via **`RpgPlayer`** (`scripts/RpgPlayer/`, top-level RPG): `RpgPlayer.spawn(world, spawn, { bbox, dir, speed })` builds the RPG player entity (transform + `Collision` + `Health`/`Stats`/`Inventory`/`Equipment`/`Encumbrance`/`Visual`) and `RpgPlayer.fireBullet(world, shooterId, { speed, damage, muzzleY? })` spawns the cursor-aimed bullet and returns the normalized aim `{ nx, ny }`. **`PlatformerController`** is a movement showcase — it builds a plain player itself (transform + `Collision` + `Direction`/`Grounded`/`Visual`, **no** RPG components) and has no firing. Each controller then adds its genre-only bits (platformer `Grounded`, top-down `Animator`) and its own movement.

- `create(world, spawn)` — registers the keymap (`Input.bindAll`), spawns the player (TopDown via `RpgPlayer.spawn` + genre components; platformer builds a plain entity), returns a plain `ctrl` state bag (`{ id, facing, ... }`). The `"bullet"` `EntityPreset` is registered by `RpgPlayer.spawn` (TopDown only now — kinematic + bbox-less so `GravitySystem` skips it and it can't be a raycast self-target; top-down has no gravity).
- `pollInput(ctrl)` — call **once per frame, before `world.update()`**, outside the tick loop. Samples _edge-triggered_ input (jump `pressed()`/`released()`) into buffers so presses aren't lost on 0-tick frames or double-counted on multi-tick frames.
- `update(world, ctrl)` — call **once per physics tick**. Reads _continuous_ input (movement) and applies acceleration/jump to `Velocity` (before `SolidSystem` integrates it).
- `destroy()` — unregisters input. Plus genre verbs like `respawn`, `setPower`, `tryFireball`.

See the **GMRT boolean-local clobber** note in memory: read flags like `Grounded.isGrounded` live off the component each use — caching a primitive bool in a local is miscompiled.

**Template gameplay systems** are stateless `globalThis` objects like Core systems but expose _named query/resolve methods_ (not `update(world)`), called explicitly from `step()` after physics resolves: `EnemySystem` (`update` patrol + `resolveStomp` jump-kill + `resolveTouch` side-hit) and `CollectibleSystem` (`hitSpike`). They read `col.hits` (filled by `TriggerSystem`) or do their own overlap test, and return values the scene applies to player state. (These are the platformer's; the RPG combat/loot systems live under the top-level RPG layer.)

`scenePlatformer` (a movement showcase, no RPG) is a compact reference orchestration: per tick → `snapshot` → `controller.update` → `physics` Pipeline (`Gravity → clampFall → SolidSystem → TriggerSystem`) → `EnemySystem.update` → `resolveStomp` (bounce the player on a kill) else `resolveTouch`/`hitSpike` → respawn → void-fall respawn → `flush`. One open hand-built level.

**Lobby categories** are `SCENE_CAT_*` i18n keys: `ACTION`, `RPG`, `STRATEGY`, `MAP`. `SceneRegistry.add(factory, { label, category })` slots a scene under one.

## Gameplay / RPG Layer

**TopDown** is the action-RPG (the platformer is a movement showcase with no RPG layer). The pieces below live under the top-level **RPG** folder (primitives in **Core**) and are driven explicitly from the scene's `step()`, never auto-run by `World`. The design constraint throughout is **composition over inheritance** (GMRT can't do `super`/subclassing): "kinds of item" are a flat `Item` carrying a `components: []` array of standalone capability/marker classes queried by `instanceof` — exactly the `UIElement.getComponent` pattern.

**Items & registry.** `Item` (`scripts/Item/`) is a definition registry (`Item.register([...])`, `Item.get(id)`), like `Rarity`. A definition is identity + universal scalars (`name` i18n key, `sprite`, `stack`, `weight`, `value`, `rarity`) plus `components` — capability/marker instances attached via `addComponent` and read via `getComponent(Class)`/`hasComponent(Class)`:

- `Equippable` (`{ slot, mods }`) — wearable in an `Equipment` slot (`weapon`/`armor`/`trinket`/`backpack`); `mods` are flat `Stats` deltas applied while worn.
- `Weapon` (`{ damage, fireCd?, bulletSpeed?, melee?, reach? }`) — attack profile. A `melee` weapon swings a hitbox `reach` px in the facing direction (`MeleeSystem`); a ranged weapon fires a cursor-aimed bullet (`ProjectileSystem`). The **`TopDownController`** honors the `melee` flag (swing vs fire path).
- `Consumable` (`{ heal }`) — usable from the bag (one unit consumed for an instant effect).
- `Container` (`{ capacity }`) — while equipped, grows the wearer's `Inventory.capacity` (e.g. a backpack pairs `Equippable` + `Container`).

`Rarity` (`scripts/Rarity/`) is a parallel registry of tiers (`{ id, name, color, valueMod }`); rarity color drives loot/inventory tinting. **`RpgContent`** (`scripts/RpgContent/`, top-level RPG layer) registers **all** RPG content — the rarity tiers, the **full item set** (consumables, weapons `wood_sword` (melee) + `blaster` (ranged), armor/trinket/backpack, currency `coin`/`gem`/`key`, crafting materials), and the workbench recipes. TopDown's own content is **`TopDownContent`** — its quests + achievements. `sceneTopDown` calls `RpgContent.register()` once from `create()` (via `TopDownContent.register()`, which calls it first) — **not** at top level, to dodge GMRT load-order issues. (`RpgContent` is the sole RPG content registry now that the platformer no longer uses items.)

**Inventory & equipment (pure systems over components).** Components are string tokens; their systems take the component (or `world` + entity id) directly, with no world tick:

- `Inventory` = `{ slots: [{ itemId, qty }], capacity, maxWeight? }` — every player, enemy (its loot table), and storage chest owns one. `InventorySystem` (`add`/`remove`/`has`/`weight`) stacks per `Item.stack`, and `add` is gated first by `maxWeight` then by `capacity`, returning the amount that did **not** fit.
- `Equipment` = `{ slots: { weapon, armor, trinket, backpack } }` of itemId strings (flat → `world.export`-safe). `EquipmentSystem.equip`/`unequip` keep the item in the `Inventory` (it still counts toward capacity/weight) and add/remove its `Equippable.mods` to the live `Stats` (and any `Container.capacity` to the `Inventory`). Deltas always pair, so no recompute-from-base pass is needed. `EquipmentSystem.weaponProfile` reads the equipped `Weapon` for the controller's fire logic.
- `ConsumableSystem.use` applies a `Consumable`'s effect and removes one unit; it refuses to waste an item that would do nothing (e.g. healing at full HP).
- `Encumbrance` (`{ threshold, minScale }`) + `EncumbranceSystem.scale(world, id)` → a speed multiplier from carried weight, read **live** by the mover (`TopDownController.update`) rather than mutating `Stats.speed` (so it composes with equipment mods instead of fighting their balanced deltas).

**Combat & stats.** `Health` = `{ hp }`; `Stats` = the session-scoped character sheet (`level`, `xp`, `xpNext`, `maxHp`, `attack`, `defense`, `speed`). `MeleeSystem.swing(world, attackerId, dirX, dirY, reach, damage)` resolves a melee hit immediately (no projectile): an AABB hitbox extends `reach` in the facing **direction** (a vector snapped to the dominant axis — 4-way for top-down) and damages every overlapped body with `Health` **except the attacker** (in the top-down template that's exactly the slimes — the player is excluded; NPCs/furniture carry no `Health`), removing it at ≤ 0 hp and returning the struck ids. Ranged attacks go through the Core `ProjectileSystem`. (The platformer's `Enemy`/`EnemySystem` patrollers are a separate, non-RPG concern — see Genre controllers above.) `SlimeAI.attach(world, id, playerId)` wires an Idle→Chase→Attack machine onto a slime via the shared `StateSystem` (its `Brain` component holds `home`/`aggro`/`deAggro`/`attackRange`); slimes are dynamic solid bodies, so `SolidSystem` integrates and collides them for free.

**Loot, progression & dialogue.** `ItemDrop` = `{ itemId, qty }` on a non-solid sensor entity the player collects on overlap; enemy deaths spill their `Inventory` as drops. `QuestLog` (`scripts/QuestLog/`) holds quest defs + active progress (objectives `{ kind: "kill"|"collect"|"reach", target, count }`, rewards `{ xp?, items? }`); the scene calls `QuestLog.report(kind, target)` after gameplay events and turns in on NPC interaction. `NPC` = `{ name, lines, questId? }` — the scene proximity-checks the player and opens a dialogue panel that can offer/turn in the linked quest. `Animator`/`AnimationSystem` are a data-driven sprite state machine: `Animator` holds a `graph` of named `AnimState`s (`{ sprite, frames, fps, loop }`); the controller picks `state`, `AnimationSystem.update` advances playback into the entity's `Visual` (clamps `frames ≥ 1` for the SVG-sprite quirk).

**Genre UI managers** (in Core, RPG, and Showcase) — gameplay overlays that are not the GemsUI scene panels:

- `SystemMenu` — the app's **one menu**: a global, open-anytime, **near-fullscreen multi-tabbed** "simulator/emulator manager" overlay (demo-shell global; absorbed both the old `SettingsMenu`/`SCENES.settings` **and** the old `PauseMenu`). Built on a custom `UIModal` root sized from `display_get_gui_height()` at open (flexpanel can't resize after layout). It **pauses ALL game + behind-UI logic** while open: `obj_game` skips `scene.step()` for _any_ scene whenever `SystemMenu.isOpen()`, and the menu forces `Time.scale = 0`/`Time.delta = 0` each frame (UI itself runs on `Time.raw`); the `UIModal` blocks pointer + nav beneath it. **It also owns the gameplay pause + nav** (the former `PauseMenu` job): a scene opts in with `this.gameplay = true` in `create()` (a subclass field initializer wouldn't run — GMRT), and while closed over such a scene `update()` holds `UINav.suspended = true`; **F1** opens it anywhere, **Esc / gamepad Start** open it during gameplay. Tabs: **System** (live readouts — scene label, FPS, entity count via `world.ids` — plus a `Speed` time-scale select and `Resume`/`Step Frame`/`Restart Scene`/`Quit to Lobby`), **Settings** (the former settings form, all `Settings`-bound, with explicit Save), **About** (project/engine info, reuses `CREDITS_*`), **Debug** (FPS/frame-ms readouts + a snapshot of the recent `Log` buffer + Clear). API: `open(tabIndex = 0)` (the lobby's Credits passes `2` → About) / `close()` / `isOpen()` (a method, not a `static get` — GMRT) / `scale()` / `consumeStep()` (one-shot frame-step) / `reset()`. `obj_game` drives `SystemMenu.update(this)` in `Step_0` before `UINav.update` (receives the controller so the System tab can read/restart/quit the live scene via `this.scene`/`this._sceneFactory`/`this.openScene`), gates `scene.step()` on `!isOpen() || consumeStep()` (frame-step runs exactly one `scene.step()` at the chosen speed while paused), and calls `SystemMenu.reset()` (close + restore `Time.scale`) on each scene swap. Entry points: the lobby footer (Settings + Credits), `F1`, and gameplay Esc/Start.
- `StorageUI` — storage-chest transfer window for the TopDown RPG scene. Any entity tagged `"storage"` with an `Inventory` is a chest; walk near and press `interact` (E) to open a two-column Bag↔Chest transfer window (a draggable `gemsWindow`). All per-open state lives on the **scene** (namespaced `_store*`), so two scenes can't clobber each other and `teardownScene` cleans it up. Contract: `build(scene)` once after player + ui exist, `update(scene)` each frame, set `scene._storeDirty` when the bag changes elsewhere.
- `BuildMode` — **TopDown grid build mode** (stateless singleton, same module shape as `Interactable`). `build(scene)` once in `create()`, `update(scene)` each frame after `Interactable.update` (outside the tick loop), `drawWorld(scene)` in the scene's `draw()`. `B` toggles; the mouse wheel cycles a two-entry palette (wall = solid + collider, floor = walkable cosmetic), LMB places (1 wood, via `SlotDrag.pressed` — the already-latched LMB edge) and RMB deconstructs (refunds the wood). Building is gated to a **claimed buildable `Zone`**: the player presses `E` at a **Survey Post** (a `Station` of kind `"claim"`; `Interactable._open` routes that kind to `BuildMode.claim`, which `paintRect`s the `"buildable"` `ZoneMap` channel around the post). Tile reads/writes/remesh go through the Core **`TileEdit`** service (not inlined): a wall edit is `TileEdit.set`/`clear` + `TileEdit.remesh` (re-greedy-mesh all wall colliders, so built walls re-merge seam-free), floor edits touch no collider, and occupancy/placement tests use `TileEdit.occupied`. So `BuildMode` carries only the **gameplay** layer (mode, HUD, wood economy, zone gate, the `_built` tracking) and no longer depends on `TopDownLevel`. All per-scene state lives on the scene (`_built` = `"gx,gy" → palette`, `_buildPalette`, `_buildActive`), except a static `BuildMode.active` mirror that `TopDownController` reads to suppress weapon fire while building.
- `RpgWorldOverlay` — the TopDown **world-space** overlay (`drawWorld(scene)`, called from `sceneTopDown`'s own `draw()` inside the camera view): item-drop rarity squares, bullets, and — when the scene exposes `reachZone` — the reach-quest zone. (Once shared with the platformer, which replaced the near-identical per-genre `PlatformerUI`/`TopDownUI`; now TopDown-only.) `_rarityColor` is shared with the scene's inventory rows. The HUD, dialogue box, and inventory window are real UI panels the scene builds and the UI manager draws on the GUI layer (`Draw_75`). **TopDown's walls are a real tilemap** (`TopDownLevel` keeps a wall + floor `TileLayer` on the `Level`), drawn by a `RenderDebugTileMap` pass with the buildable region drawn by a `RenderZone` pass — both world-space renderer passes under the entity passes.

The combat/loot plumbing the RPG scene (`sceneTopDown`) uses lives in **`RpgScene`** (`scripts/RpgScene/`, top-level RPG) — free functions taking the scene (composition; no class inheritance on GMRT): `trackDamage(scene, yOffset)`, `resolveDeaths(scene, { onKill?, spill? })`, `spillLoot`/`spawnDrop`, `collectDrops(scene, onCollect?)`, `checkPlayerDeath(scene, onRespawn)`. Scene-specific side effects (quest/profile counters, the respawn action, FloatingText height) are the callbacks/options; the scene supplies the contract fields `world`/`ctrl`/`enemies`/`_hpTrack`/`_invDirty`. (Originally factored out of two RPG scenes; the platformer no longer carries this plumbing.)

The draggable **inventory/equipment/stats window** is likewise centralized in **`RpgInventoryUI`** (`scripts/RpgInventoryUI/`, top-level RPG): `build(scene)` creates the (hidden) `gemsWindow` (stored as `scene._invWin`), `rebuild(scene, { equipSlots, extraRows? })` repopulates its body from the live `Inventory`/`Equipment`/`Stats` — `equipSlots` is the equipment rows to show (top-down adds `backpack`), `extraRows(scene, body)` appends genre lines (top-down's Profile records). The scene keeps only the open/close state (`invOpen`, toggled on the `inventory` key) and calls `build` in `create()` + `rebuild` when `_invDirty`. This is intentionally the **one place** to overhaul into a table/grid-based inventory later — the current row-of-buttons layout is a placeholder. It's used by `sceneTopDown` (and `sceneEditor`). (The HUD stays per-scene — `sceneTopDown`'s `_buildHud` = HP + the quest tracker.)

`sceneTopDown.step()` is the reference RPG orchestration: edge-toggle the inventory window → per tick: `snapshot` → `controller.update` → `physics` Pipeline → `RpgScene.trackDamage` → `RpgScene.resolveDeaths` (quest/profile counters via `onKill`) → `RpgScene.checkPlayerDeath` → `RpgScene.collectDrops` → reach/quest/achievement checks → `flush`; then once per frame: `AnimationSystem.update`, NPC proximity + dialogue, `Interactable.update`, `BuildMode.update`, `camera.update`, and an inventory rebuild when `_invDirty`. (No pause gate in `step()` — `obj_game` skips `scene.step()` entirely while the `SystemMenu` overlay is open.)

## Built-in Systems

| System                | File                           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GravitySystem`       | `scripts/GravitySystem/`       | Applies `strength * direction * tickDuration` to entities with `Velocity`. `world.gravity` overrides `GravitySystem.strength`. Configurable: `.strength`, `.direction`.                                                                                                                                                                                                                                                                                                                     |
| `MovementSystem`      | `scripts/MovementSystem/`      | Integrates `Velocity` into `Position` each tick. For _free_ movers with no collision response; solid bodies are integrated by `SolidSystem` instead.                                                                                                                                                                                                                                                                                                                                        |
| `SolidSystem`         | `scripts/SolidSystem/`         | Discrete "move-and-collide" for dynamic solid bodies vs `kinematic` solids. Integrates each body's `Velocity` itself, sub-stepped (`SolidSystem.maxStep`, default 8) so fast movers can't tunnel, resolving per axis (wall-slide for free). Sets `Grounded.isGrounded` when a body is pushed up out of a downward move — replaces the old `GroundedSystem`. Requires `Collision` (solid, non-kinematic), `Position`, `BBox`, `Velocity`. `Grounded = { isGrounded }` (`scripts/Grounded/`). |
| `SeparationSystem`    | `scripts/SeparationSystem/`    | Equal-mass MTV push-apart between dynamic solid bodies (unit crowding). `SeparationSystem.iterations` passes per tick so dense clusters settle. Pure resolution — run after `SolidSystem`. Uses `world.broadphase` if set (see `Broadphase`); otherwise O(n²) per iteration.                                                                                                                                                                                                                |
| `TriggerSystem`       | `scripts/TriggerSystem/`       | Overlap detection → fills/clears `col.hits` for game logic (sensors, pickups). Detection only; records pairs where at least one side is non-solid. Owns `col.hits`. Uses `world.broadphase` if set (see `Broadphase`); otherwise O(n²).                                                                                                                                                                                                                                                     |
| `ProjectileSystem`    | `scripts/ProjectileSystem/`    | Move-and-raycast for `Projectile` entities: casts the per-tick segment via `Raycast`, applies `Projectile.damage` to a hit `Health` (despawns it at ≤ 0 hp), then despawns the bullet. Range bounded by `Lifetime`. `Projectile = { damage, owner }`.                                                                                                                                                                                                                                       |
| `StateSystem`         | `scripts/StateSystem/`         | State machine. `StateSystem.change(world, id, schema, force?)` queues; `update(world)` processes. `StateSchema = { enter?, update?, finish? }`.                                                                                                                                                                                                                                                                                                                                             |
| `LifetimeSystem`      | `scripts/LifetimeSystem/`      | Decrements `lt.ticks` each tick; `world.remove(id)` when `≤ 0`.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `InterpolationSystem` | `scripts/InterpolationSystem/` | Render-interpolation bookkeeping. `snapshot(world)` records each mover's `Position` into `PrevPosition` (`scripts/PrevPosition/`) — call at the **top of each tick**, before any system moves `Position`. Renderers then draw at `PrevPosition + (Position − PrevPosition) * world.alpha` to keep fixed-step motion smooth when display refresh ≠ tickrate. Tracks `Velocity` movers only; static bodies fall back to `Position`.                                                           |
| `PathfindingSystem`   | `scripts/PathfindingSystem/`   | `setGrid(grid)`, `update`, `invalidate`, `current(world, id)`, `advance(world, id)`. See Pathfinding Flow.                                                                                                                                                                                                                                                                                                                                                                                  |

## Pathfinding Flow

1. `world.add(id, PathRequest, { startX, startY, goalX, goalY })` — request in grid coords.
2. `PathfindingSystem.update(world)` resolves → writes `PathResponse: { path, index }` (`index` = cursor).
3. `PathfindingSystem.current(world, id)` → current waypoint `{x, y}` or `undefined`.
4. `PathfindingSystem.advance(world, id)` → `true` if more waypoints remain; `false` (and detaches `PathResponse`) when complete.
5. After any grid change: `PathfindingSystem.invalidate(world)` — detaches all `PathResponse`.

## Level & Map Layers

`Level` (`scripts/Level/Level.js`) manages the tile grid and pathfinding grid, **separate from `World`** (the ECS).

```js
const LEVEL = new Level({ cellWidth: 32, cellHeight: 32 }); // cols/rows derived from room size
const terrain = new TileLayer(LEVEL.cols, LEVEL.rows, { emptyCost: Infinity }); // blocking base
LEVEL.insert(terrain); // append a LevelLayer (LEVEL.remove to detach)
PathfindingSystem.setGrid(LEVEL.mpg); // wire up after layers are ready
LEVEL.syncAll(); // recompute all pathfinding costs (or syncAt(x, y) for one cell)
PathfindingSystem.invalidate(world); // call separately after any grid change
LEVEL.worldToGrid(wx, wy);
LEVEL.gridToWorld(gx, gy); // ↔ { x, y } (gridToWorld returns cell center)
```

**`LevelLayer` interface**: `get(x,y)`, `set(x,y,v)`, `getNavData(x,y) → { cost }`, `export()`, `import()`, `destroy()`. The one built-in is **`TileLayer`** (`scripts/TileLayer/`), wrapping a `Grid` of **`TileType`** values. Later-added layers have higher nav-cost priority. Empty cells report the layer's `emptyCost`: `undefined` (default) passes through to lower layers; `Infinity` makes a blocking base. `TileType` (`scripts/TileType/`) holds `{ id, name, pathCost }` (`pathCost: null` → `Infinity`, default `1`). The former `Floor`/`Terrain`/`Structure` layers and their value classes are consolidated into `TileLayer`/`TileType`.

**`TileEdit`** (`scripts/TileEdit/`, Core) is the genre-agnostic tile-editing service that keeps a layer's **derived data** (nav cost + solid colliders) in sync with edits, so the "edit a solid tile → resync nav + rebuild colliders" invariant lives in one place. `occupied(layer,gx,gy)` (truthy read — `Grid.get` returns `0`, not `undefined`, for an empty in-bounds cell), `set(level,layer,gx,gy,type)` / `clear(level,layer,gx,gy)` (write + `level.syncAt`), `meshSolid(world,level,layer,out)` (greedy-mesh the solid cells into the fewest kinematic-solid colliders — extend right for width, then down while the whole row is solid — so straight walls become single seamless colliders, avoiding the per-cell-seam snag bug; box size = `level.cellWidth/Height`, ids pushed onto `out`), and `remesh(world,level,layer,colliders)` (remove old + re-`meshSolid` after a solid-tile edit). Shared by `TopDownLevel.build` (initial mesh) and `BuildMode` (per-edit set/clear/remesh); the seed for a future in-engine tile editor.

### Zones

**`Zone`** / **`ZoneMap`** / **`ZoneSystem`** add named, tagged spatial regions on top of the level grid — the substrate for build-mode buildable area, faction territory, in-game events, quest regions, weather areas, etc. (Separate from tile layers and from nav cost; a zone is metadata, not a tile.)

- **`Zone`** (`scripts/Zone/`) — a flat definition object `{ id, name, tags, data }`. `tags` is a **`string[]`** (`hasTag(t)` via `indexOf`), never a `Set` (Set iteration crashes GMRT); `data` is a flat scalar payload (`{ factionId, weather, questId, color, … }`) to stay JSON-safe.
- **`ZoneMap`** (`scripts/ZoneMap/`) — one zone **channel**: a `Grid` of zone-id ints (`0` = none) plus a registry of `Zone`s, exactly as `TileLayer` wraps `Grid<TileType>`. A cell belongs to **at most one zone within a map**, so lookup is O(1) and storage is one int per cell; purposes that can overlap (faction vs. weather vs. event) live in **separate maps**. API: `define(opt) → Zone` (auto-assigns id), `zone(id)`, `byTag(tag)`, `paint(id,gx,gy)`/`paintRect(id,x1,y1,x2,y2)`, `erase`/`eraseRect`, `idAt(gx,gy)`, `at(gx,gy) → Zone`, `contains(gx,gy,tag)`, `cells(id) → {x,y}[]`, `export`/`import`/`destroy`.
- **`ZoneSystem`** (`scripts/ZoneSystem/`) — the entity↔zone glue, a stateless system object with named methods (no World tick): `update(world, level, map, { tag?, onEnter?, onExit? })` fires enter/exit edges as entities cross borders (mark-and-sweep over `map._inside`, so leaving to an empty cell _or_ being removed both fire `onExit`); `zoneOf(world, level, map, id) → Zone`; `entitiesIn(world, level, map, id, { tag? }) → id[]`. Drive `update` from a scene's `step()` for events/weather/quests.

Zones live on the **`Level`** (they are level data): `level.addZoneMap(key, map?)` (sized to the grid by default), `level.zoneMap(key)`, and `level.zoneAt(key, wx, wy) → Zone` (world-space convenience). `Level.export`/`import` round-trip zone maps under a `zoneMaps` key, emitted only when non-empty so existing serialized levels are unaffected; `Level.destroy` tears them down.

To **visualize** a channel, add a `RenderZone` pass (see Renderer) to the scene's renderer: `renderer.insert(new RenderZone(level, "faction", { labels: true }))`.

The reference consumer is TopDown's **build mode** (`BuildMode`, see Genre UI managers): a `"buildable"` channel whose region a Survey Post claims (`paintRect`), gating where tiles may be placed, drawn by a `RenderZone` pass.

## Renderer

`Renderer` (`scripts/Renderer/Renderer.js`) is an ordered list of `RenderPass` objects (`{ draw(world), destroy() }`). `insert(pass, index?)` / `remove(pass)` manage the list; `draw(world)` runs every pass; `destroy()` tears them down. Each scene owns its renderer and calls `this.renderer.draw(this.world)` in `draw()`.

Built-in passes:

- **`RenderEntity`** — draws entities with `Visual` + `Position` via `draw_sprite_ext`. Interpolates between `PrevPosition` and `Position` by `world.alpha` when present (see `InterpolationSystem`); falls back to raw `Position` otherwise.
- **`RenderDebugBox`** — draws each entity as a filled `Visual.color` rectangle (GMRT 0.19 can't render the SVG character sprites) plus its `Name` label; interpolates via `PrevPosition` + `world.alpha`. The gameplay templates use this as the entity pass, pairing it with `RenderDebugEntity` inserted _after_ for the lime bbox overlay on top.
- **`RenderTileMap`** (`new RenderTileMap(layer, level, sprite, opt?)`) — hardware-accelerated tiles via `VertexBuffer`. `opt`: `{ autotile: 0|16|47|"dual", alpha, color, softEdge }`. Call `.markDirty()` after tile changes to rebuild the VBO. Autotile: `0` = raw frame id, `16` = blob4, `47` = blob8, `"dual"` = dual-grid corner sampling. Neighbor bits: `N=1, E=2, S=4, W=8` (blob8 adds `NE=16, SE=32, SW=64, NW=128`), so a blob4 tileset's frame index equals its cardinal-neighbor mask. `spr_tile16` is the project's 16-frame blob4 tileset; the **Tile Inspector** scene (`scripts/sceneTileInspect/`) lays out all 16 frames against this rule to validate frame order (`sceneTileInspect47` does the same for the 47-frame blob8 set).
  - **`"dual"` (dual-grid)** — the blob modes draw one centered tile per _filled cell_ and cannot show two materials meeting (binary occupancy: a 2×2 filled block renders as a donut with blob4). Dual-grid instead renders a half-cell-**offset** grid where each display tile samples the 4 cells touching a grid _corner_; corner bits `TL=1, TR=2, BR=4, BL=8` → 16-frame index = mask (like blob4 but corner-keyed). Because a tile's empty corners stay transparent, **stacking several `"dual"` passes — one `TileLayer` per terrain, lowest priority first** — makes each upper terrain's border reveal the one beneath it, i.e. RPG-Maker-style A-over-B transitions with only a 16-frame corner tileset per terrain (no hand-drawn transition art). This is how the project supports _terrain-to-terrain_ blending; the priority stack is just ordered `Renderer` passes (no new class). Validate corner art with `sceneTileInspectDual`; see `sceneTileTerrain` (water < sand < grass) for the reference composition. `softEdge` is ignored in dual mode. `spr_tiledual` is the project's 16-frame corner tileset (frame N fills the corners of mask N); both dual demos use it.
- **`RenderDebugEntity`** — `BBox` outlines (lime) + `Name` labels (white) for all entities with `Position`. Interpolates via `PrevPosition` + `world.alpha` like `RenderEntity`.
- **`RenderDebugPath`** (`new RenderDebugPath(level)`) — active `PathResponse` paths (yellow) + pending `PathRequest` goals (red cross).
- **`RenderZone`** (`new RenderZone(level, key, opt?)`) — world-space overlay for one **zone channel** (see Zones): fills each zone's cells by color, outlines region borders (only edges where the neighbor differs, so map edges outline too), and optionally labels each zone at its centroid. `opt`: `{ alpha, border, labels, font }`. Color is `zone.data.color` (`"#rrggbb"`) when set, else a stable hue from the zone id. Reads `level.zoneMap(key)` live each frame — a no-op until that channel exists, so it's safe to insert before zones are painted. Uses plain `draw_line` for borders (`draw_line_width_color` renders nothing on GMRT).
- **`RenderDebugTileMap`** (`new RenderDebugTileMap(level, opt?)`) — overlay: cost shading, grid lines, tile id/name + coordinate labels. `opt`: `{ grid, cost, tiles, coords, names, color, alpha, font }`. Call `level.syncAll()` first.

**`VertexBuffer`** (`scripts/VertexBuffer/`) wraps GameMaker vertex buffers with a fixed `position + texcoord + colour` format: `.begin()`, `.addQuad(x,y,w,h,u0,v0,u1,v1,color?,alpha?)`, `.addQuadV(...)` (per-corner alpha), `.end(freeze?)`, `.submit(texture)`, `.destroy()`.

## UI System

- **`UIElement`** (`scripts/UIElement/`): tree node backed by `flexpanel` (GameMaker Flexbox). `insertChild`, `removeChild`, `addComponent(c)`, `getComponent(Class)`, `getComponents(Class)`, `removeComponent(c)`. `markDirty()` propagates to root; `refresh()` calls `flexpanel_calculate_layout`.
- **`UI`** (`scripts/UI/`): static root registry. `UI.insert(root, index?, enabled?)`, `UI.remove(root)`, `UI.setEnabled(root, bool)`. `update()` traverses in reverse (highest index blocks lower); `draw()` forward.
- **`UIComponent` interface**: `{ onUpdate?(element, block), onDraw?(element), onDestroy?(element) }`. Built-ins: `UIButton`, `UIText`, `UIRichText` (one markup string → colored spans `[c=#hex]…[/c]` + inline icons `[spr=name]`; self-sizes like `UIText`, so it's a text drawer with no NaN-width guard, and like `UIText` can't self-size at runtime — host stacked lines in explicit-height rows), `UIImage`, `UIPanel`, `UITrigger`, `UISlider`, `UISelect`, `UIInput`, `UIRebind` (key-rebinding row — shows an `Input` action's current keyboard binding, click to arm "press a key…" capture, the next key press rebinds the action's first button in place; Esc/mouse-click cancels), `UIProgress` (non-interactive 0–1 fill bar), `UICheckbox` (visual toggle; `style:"check"` box+tick or `"switch"` pill+knob), `UITooltip` (self-contained hover tooltip — detects its own hover via `positionMeeting`+`block`, no `UITrigger` needed; feeds the global `Tooltip` past a dwell delay), `UIStepper` (numeric `< n >` stepper over a min/max/step range), `UISlots` (grid of inventory slots; `draggable` opts into `SlotDrag`; immediate-mode draw reading data live), `UITabs` (tab strip — one focus stop, swaps content by toggling each overlay's `enabled`, no reflow), `UIAccordion` (collapsible section; confirm expands/collapses, text-glyph chevron), `UIScroll` (vertical scroll controller for a `clip` viewport — draw-time `scrollY` offset, wheel + drag-thumb, never flex mutation), `UIModal` (controller on a full-screen root — exclusive backdrop blocks pointer + nav, Esc/backdrop close, animated enter/exit; built by `gemsModal`), `UIDrag` (drag handle for a movable window — accumulates pointer delta into `target.dragX/dragY`, the offset-not-mutation pattern), `UINineSlice` (sprite-skinned panel via `draw_sprite_stretched_ext`; the source sprite needs nine-slice enabled in the IDE), `UIMinimap` (radar blip view of a `World` around a target — immediate-mode, `rules` `[{ tag, color }]`), `UIQuestTracker` (live list bound to the global `QuestLog`; immediate-mode, resolves `I18n.font(key)` at draw time — see the font-handle quirk in CLAUDE.md).
- **`Tooltip`**: standalone static class (not a `UIComponent`). `Tooltip.set(str)` from anywhere; renders once per frame at mouse position via `Tooltip.draw()` in `Draw_75`.
- **`Toast`**: standalone static class (not a `UIComponent`), same pattern as `Tooltip`. `Toast.push(str, opts)` from anywhere; `Toast.draw()` in `Draw_75` (after `Tooltip`) ages the stack by `Time.raw` and renders a bottom-center timed stack (newest at bottom). `opts`: `{ duration, type ("info"|"success"|"warn"|"error"), accent }` — `type` picks the left accent-stripe color; entries fade/slide in+out and are culled when expired (`Toast.maxItems` cap drops the oldest).
- **`SlotDrag`**: standalone static class (not a `UIComponent`) backing drag-and-drop between `UISlots` grids (built with `draggable: true`). `SlotDrag.poll()` runs in `Step_0` before `UI.update` and latches the mouse edges once per frame (`pressed`/`released`) — UISlots and SlotDrag read those, never `mouse_check_button*` directly (see the realtime-sampling note in GMRT-Safe Idioms). A grid calls `SlotDrag.begin(grid, i)` on `pressed` over a filled slot (picks it up; source slot empties, floating icon drawn in `SlotDrag.draw()` in `Draw_75`), then `SlotDrag.hover(grid, j)` each frame the cursor is over one of its slots to **record** the drop target. `SlotDrag.update()` (`Step_0`, after `UI.update`) resolves on the release edge: drop onto the last-recorded slot (swaps occupants, works across grids), or — if none was ever hovered — restore to source. The recorded target is _persisted_ (not cleared when the cursor leaves a slot), so a small drift off the slot as the button comes up still drops. (Note: `UISlots.onUpdate` keeps the hit-test in instance fields `this._inside`/`this._hover`, not boolean local consts — those get clobbered mid-function on GMRT; that was the long drag-drop bug.)
- **`VirtualKeyboard`**: standalone static class (not a `UIComponent`) — on-screen keyboard for gamepad/mouse text entry into a `UIInput`. `VirtualKeyboard.open(input)` pops a `gemsModal` (exclusive backdrop, blocks background nav, Esc/backdrop cancels) whose body is a preview line + a grid of character keys; the keys are ordinary `gemsButton`s, so the whole keyboard is `UINav`-navigable for free (dpad/stick to move, A/Enter to type). Keys edit an in-memory buffer; **Done** commits to the field (`setValue` + `onConfirm`), Cancel/Esc/backdrop discard — the field is untouched until Done. Shift toggles letter case via live key labels (no relabel). `VirtualKeyboard.isOpen()` is a **method, not a `static get`** — GMRT 0.19 does not invoke static getters (instance getters work; a static getter silently returns `undefined`).
- **`UINav`**: standalone static class (not a `UIComponent`) — keyboard/gamepad menu navigation, touching neither `UI` nor `UIElement`. An element is **focusable** purely by duck-typing: a component implements `navActivate(element)` (confirm) and/or `navAxis(element, dir)` (horizontal adjust, `dir` = −1/+1). `UINav.update()` (`Step_0`, after `UI.update`, before the pending-scene swap) walks the enabled roots, collects focusables with a valid on-screen rect (skips ones scrolled out of a `clip` ancestor), and routes input: arrows/dpad/left-stick move focus to the geometrically nearest focusable in that direction; a horizontal press over a widget with `navAxis` tweaks it instead of moving; Enter/Space/`gp_face1` → `navActivate`; Esc/`gp_face2` disengages. `UINav.draw()` (`Draw_75`) draws a pulsing accent focus ring. Roots are collected **top-down and collection stops at an exclusive root** — a component implementing `navExclusive() → true` (e.g. an open `UIModal`) blocks nav from reaching the roots beneath it, mirroring the modal's pointer block. Focusables scrolled out of a `UIScroll` viewport stay collectable (so a list taller than its window is fully reachable without a mouse); when focus lands on one, `_scrollIntoView` nudges each `UIScroll` ancestor's `scroll` so the focused element comes into view — the scroll follows focus. Engagement model: the first nav input only engages + focuses (doesn't act); moving the mouse disengages (ring hidden) so pointer and pad don't fight; while a field is being typed (`UIInput.active` set) nav is suspended so the caret keeps the arrows/Enter. `obj_game` calls `UINav.reset()` on every scene swap and seeds `UINav.color` from the theme. Directional routing is **edge-aware** (`_pick`): the perpendicular term is the _gap between rects_ (0 when they overlap on the cross axis), with ties broken by collection order, so e.g. Down from a full-width row lands on the leftmost item below (reading order) rather than whichever sits nearest screen-center. Nav hooks live on `UIButton`/`UICheckbox`/`UISelect`/`UIStepper`/`UISlider`/`UITabs` (tab strip = one focus stop, left/right switches tabs)/`UIAccordion` (confirm expands/collapses)/`UIInput` (confirm focuses the field for typing; Enter/Esc blur and resume nav); any new interactive widget becomes navigable just by adding `navActivate`/`navAxis` (and a "blocking" root by adding `navExclusive`). **Debug overlay**: hold `UINav.debugKey` (Tab) to draw every focusable boxed + numbered in collection order, with colour-coded `U`/`D`/`L`/`R` lines from the focused element to each direction's target — to diagnose awkward routing.
- **`SceneTransition`**: standalone static singleton — full-screen fade between scenes, replacing `obj_game`'s hard cut on `openScene`. `start(applyFn)` fades OUT to a solid cover, swaps the scene at full cover (`applyFn` rebuilds the UI hidden under the cover), then fades back IN. Wiring: `SceneTransition.update()` in `Step_0` (drives the timer + fires the swap at mid-fade, gated by `isBusy()`); `SceneTransition.draw()` **last** in `Draw_75` so the cover veils the UI teardown/rebuild too. Timer uses `Time.raw`.
- **`Dialogue`**: standalone static singleton — RPG paged dialogue box with typewriter reveal. `Dialogue.start(pages, opts)` (a page is a string or `{ speaker, text }`); reveals at `opts.speed` chars/sec (`Time.raw`), advances on Enter/Space/`gp_face1`/click. `Dialogue.update()` in `Step_0`, `Dialogue.draw()` in `Draw_75` (over the UI). Static fields are initialized with literals, not `Dialogue.x` self-references (the static-initializer self-reference quirk in CLAUDE.md).
- **`FloatingText`**: standalone static singleton — **world-space** floating combat numbers (damage/heal) that rise + fade. `FloatingText.push(x, y, value, opts)`; drawn from a **scene's own `draw()`** (inside the camera view), _not_ `Draw_75`. `obj_game` calls `FloatingText.clear()` on each scene swap (a number must not survive into the next scene). Ages by `Time.delta` (sim time — slow-mo slows the numbers too), unlike the GUI singletons on `Time.raw`.
- Many `flexpanel_node_style_*` calls in `UIElement` are commented out pending GameMaker bug [#15065](https://github.com/YoYoGames/GameMaker-Bugs/issues/15065). Don't uncomment until resolved.

## Input System

**`Input`** / **`InputAction`**: `Input.register(key, action)`, `Input.get(key)` → `InputAction`. Query: `.down()`, `.pressed()`, `.released()`, `.value()`. Bind: `.bindButton(source, button)` / `.bindAxis(mode, axis)`. Bulk: `Input.bindAll({ key: [source, button], … })` registers a whole keymap in one call; `Input.unbindAll([keys])` removes them — used by the genre controllers.

## `EntityPreset`

`EntityPreset` (`scripts/EntityPreset/`) spawns entities from named presets:

```js
EntityPreset.register([
  {
    id: "enemy",
    components: { Velocity: { x: 0, y: 0, z: 0 }, Lifetime: { ticks: 120 } },
  },
]);
const id = EntityPreset.spawn("enemy", world, x, y, z);
EntityPreset.has("enemy");
EntityPreset.get("enemy"); // → boolean / preset or undefined
```

## `Query` — Spatial Entity Lookup

`Query` (`scripts/Query/`) searches entities with `Position`:

```js
Query.nearest(world, x, y, opts); // → id or -1
Query.farthest(world, x, y, opts); // → id or -1
Query.inRect(world, x1, y1, x2, y2, opts); // → id[]
Query.inRadius(world, x, y, radius, opts); // → id[]
```

`opts`: `{ tag?, maxDist?, hasCollision? }`. `tag` filters by `Tag` component (`{ tags: Set }`).

## Utility Modules

- **`Settings`**: persists to `settings.json` (`Settings.PATH`). `registerDefaults({...})` before `load()` at startup (calls merge additively). `get(key)` falls back to defaults; `set(key, val)` updates memory; `save()` writes only keys present in defaults.
- **`Color`**: `Color.rgb(r,g,b)`, `Color.hsv(h,s,v)`, `Color.merge(c1,c2,t)`, `Color.parse("#rrggbb")` → GameMaker color ints; `Color.alpha(color)` → alpha byte `[0,1]`.
- **`I18n`**: `I18n.load(manifestPath)` reads a `manifest.json` listing text-file masks (e.g. `text/*.json`), fonts, images, sounds; flat `{ key: value }` text JSON is merged into `I18n.texts`. `I18n.text(key, ...params)` or `I18n.textRef(...)` (a `() => string` for live-updating UI labels); fonts via `I18n.font(key)`. Ships `en-US` (default, loaded in `obj_game` `Create_0`; no manifest fonts → falls back to the built-in draw font, which can't render Korean) and `ko-KR` (Noto Sans KR, SIL OFL 1.1). Strings are split by genre under each locale's `text/`: `common`, `platformer`, `topdown`, `rts`, `map` (the `text/*.json` mask merges them all). Fonts are keyed by role, not size: `default` (Regular 12), `header` (Bold 16), `description` (Regular 10). en-US declares no fonts, so all three `I18n.font(...)` keys resolve to the built-in draw font.
- **`Camera`** / **`cameraFollow`** / **`cameraFollow2d`** / **`cameraPan`**: `Camera` wraps a `camera_*` handle (ORTHO, PERSPECTIVE, PERSPECTIVE*FOV). `cameraFollow({ world, followTarget, followLerp?, followHeight?, ... })` — 3D perspective follow; `cameraFollow2d({ world, followTarget, followLerp?, width?, height?, ... })` — 2D orthographic (pixel-snapped); `cameraPan({ ... })` — drag-to-pan + wheel-zoom orthographic camera (RTS/map scenes). All read from `world` where relevant. Call `.update()` each step and `.assign(viewIndex)` to attach to a viewport. Note: `view_camera[]` is not exposed in GMRT — hold the `Camera` instance and read `camera_get_view*\*(camera.id)` (see GMRT-Safe Idioms).
- **`Tween`**: static easing + frame-rate-independent smoothing helper for UI motion (pure methods; callers keep their own state). Two families: `approach`/`approachColor` (exponential smoothing toward a _moving_ target, no fixed duration — UIButton's hover/press easing) and the easing _curves_ (`easeOutCubic`/`easeInOutQuad`/…) mapping `t∈[0,1]` for _timed_ 0→1 motion (Toast/modal enter, FloatingText pop).
- **`MotionPlanner`**: static A\* on `MotionPlanningGrid`. `MotionPlanner.plan(start, goal, algorithm?, opt?)` → `{x,y}[]`. Options: `allowDiag`, `cornerCutting`, `heuristicWeight`, `maxIter`.
- **`AABB`**: world-space box geometry that owns the non-uniform `BBox`-anchor convention (see Component Pattern note). `AABB.edges(pos, box)` / `AABB.of(world, id)` → `{ x1, y1, x2, y2, cx, cy }`; `AABB.overlap(a, b)` → strict overlap (touching edges don't count). Every collision/geometry system derives edges through this, never inline `pos.x + box.x` — consumers: `SolidSystem`, `SeparationSystem`, `TriggerSystem`, `BlockSystem`, `EnemySystem`, `Raycast`, `RenderDebugEntity`. (`Query` is _not_ a consumer — it does point-vs-rect tests on `Position` only.)
- **`Broadphase`** (`scripts/Broadphase/`): Uniform-grid broadphase for O(n) physics pair queries. `new Broadphase(worldWidth, worldHeight, cellSize)` — `cellSize` must exceed entity full diameter so center-based bucketing guarantees all overlapping pairs are in adjacent cells. `clear()`, `insert(id, cx, cy)`, `pairs(fn)` (calls `fn(a, b)` per candidate pair, no duplicates). Assign to `world.broadphase` to opt `SeparationSystem` and `TriggerSystem` into the broadphase path; scenes without it fall back to O(n²). Apply selectively — crowd/RTS scenes benefit; scenes with few interacting bodies (platformer) don't need it.
- **`Raycast`**: static segment-vs-AABB cast over all collider entities. `Raycast.cast(world, x0, y0, x1, y1, opts)` → nearest hit `{ id, x, y, nx, ny, t }` or `null`. `opts`: `{ ignore?, solidOnly? (default true), mask? }`. Shared by `ProjectileSystem` (bullets) and line-of-sight queries.
- **`File`**: sync I/O. Text: `File.find(mask)` → `string[]`, `File.read(fname)` → `string|undefined` (NUL-terminates the loaded buffer so `buffer_text` can't over-read past EOF into uninitialized memory — that over-read corrupts `JSON.parse` non-deterministically, the bug that long looked like a runtime memory fault), `File.write(fname, data)` → `boolean`. Binary: `File.readBuffer(fname)` → buffer handle (caller owns it, must `buffer_delete`) or `undefined`, `File.writeBuffer(fname, buffer)` → `boolean` (saves only the _used_ bytes via `buffer_save_ext` + `buffer_get_used_size`, so a `buffer_grow` buffer's over-allocation doesn't pad the file). Use the binary path for tile grids / dense or large data — JSON text both hard-faults on nested values and has an O(n²) serialize cost for big inline arrays.
- **`Log`**: text-based behavior verification (there are no tests). `Log.info/warn/error/debug(msg)` buffer timestamped lines; `obj_game` calls `Log.clear()` at startup and `Log.flush()` once per frame (only rewrites `game.log` when dirty). Read `game.log` to confirm runtime behavior without watching the window. `Log.exception(ex)` is the unhandled-exception handler `obj_game` registers via `exception_unhandled_handler` in `Create_0` — an uncaught runtime fault is written to `game.log` (`UNHANDLED EXCEPTION: <message>`) and flushed before the runner closes the game (it returns a non-zero exit code). Without it a mid-frame crash just stops the log at its last flush with no reason recorded. GMRT 0.19 populates only `ex.message` for JS runtime faults (`script`/`line`/`longMessage`/`stacktrace` come through empty), so only the message is logged.
- **Global utils** (`scripts/utils/`): `noop()`, `uuid()` → UUID v4, `rem(value)` → pixel size relative to current font size.
