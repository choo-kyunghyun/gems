# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**G.E.M.S.** (GameMaker Entity & Map System) is a UI and entity management library for GameMaker 2026.0.0.16 on the GMRT runtime (0.19.0). All game logic is JavaScript, not GML. Assets live in four IDE folders: **Core** (ECS, systems, level, render, UI, input, utilities), **Templates** (genre templates — `Platformer`, `TopDown`, `RTS`, `Map` — each holding that genre's scene plus its controllers, gameplay systems, and components), **Benchmarks & Tests** (`sceneBenchmark` and the `sceneTileInspect*` validation scenes), and **Demo** (the app shell — `obj_game`, `rm_game`, the `demo` UI helpers, `sceneLobby`, shared sprites). Lobby categories (`SCENE_CAT_*`) are independent of IDE folders — e.g. `sceneTopDown` lives in `Templates/TopDown` but registers under `SCENE_CAT_RPG`.

The entire demo runs in a single room (`rm_game`) with `obj_game` as the unified controller — no room transitions.

## Working Guidelines

Bias toward caution over speed; for trivial tasks, use judgment.

- **Think first.** State assumptions; if uncertain or a request is ambiguous, ask rather than guess silently. Push back when a simpler approach exists.
- **Simplicity first (KISS).** Minimum code that solves the problem — no speculative features, single-use abstractions, unrequested configurability, or error handling for impossible cases. Fail fast rather than hiding errors.
- **Surgical changes.** Touch only what the task requires; match existing style; don't refactor or reformat unrelated code. Mention pre-existing dead code rather than deleting it; remove only what your own change made unused.
- **Verify by running.** There are no tests — confirm behavior by running the game (see Build & Run). For multi-step work, state a brief plan with a verification check per step.

## Build & Run

The project uses `gm-cli` (experimental GameMaker CLI) with the GMRT 0.19 toolchain. The project file is `gems.yyp`; the IDE (GameMaker 2026.0.0.16) can also build and run.

```sh
gm-cli run     --toolchain GMRT@0.19 gems.yyp                 # run
gm-cli compile --toolchain GMRT@0.19 gems.yyp                 # compile only
gm-cli compile --toolchain GMRT@0.19 --errors-only gems.yyp  # compile, errors only
```

**Visual verification (screenshot review).** To *see* the rendered screen, add a temporary auto-capture (the agent can't press F5 in the live window): in `obj_game/Draw_75.js` add a frame counter on `this`, call `screen_save("auto.png")` at ~frame 150 and `game_end()` at ~152 so the run self-terminates. Then `gm-cli run` (it blocks until `game_end`), `Read` the PNG, and **revert the temp code**. Gotchas: `screen_save` does **not** create missing dirs (`screen_save("screenshots/x.png")` fails unless the folder exists — use a bare filename); a **bare** filename lands in the run/build dir `.gmcache/build-gmrt-windows-vm/build/auto.png`, *not* the `%LOCALAPPDATA%\gems\` save dir (where `game.log`/`settings.json`/`save.json` live).

## Asset Creation

**Never create GameMaker assets (scripts, objects, rooms, sprites) by hand-writing files/folders or editing the `Resources` list in `gems.yyp`.** GameMaker manages asset metadata strictly — manual edits corrupt the project or are silently ignored. Two valid routes:

**A. GameMaker IDE** — right-click a folder in the Asset Browser → Add Script / Add Object / etc.

**B. `gm-cli resourcetool`** (no IDE) — for a new script `<name>`:

```sh
gm-cli resourcetool eval "RESOURCE CREATE TYPE=Script NAME=<name>"                # registers it in gems.yyp
gm-cli resourcetool eval "RESOURCE SET EXPR=<name>.scriptSource VALUE=<name>.js"  # point at .js, not the .gml stub
```

Then delete the generated `scripts/<name>/<name>.gml` stub and `Write` `scripts/<name>/<name>.js`. To file the asset under an IDE folder, **edit the asset's own `.yy`** `parent` (`path: folders/<Folder>.yy`, `name: <Folder>`) to match a sibling — this is safe local metadata. New IDE folders: `gm-cli resourcetool eval "FOLDER CREATE FOLDER=Parent/Child"`; its name validator rejects spaces/`&` (over-strict — the IDE allows them, e.g. `UI Sprites`, `Benchmarks & Tests`), so for such names hand-add a `GMFolder` line to the `Folders` array in `gems.yyp` (this array — unlike `resources` — is safe to hand-edit; that's also how empty folders are deleted, as resourcetool has no FOLDER DELETE). Do **not** `RESOURCE SET` `.parent` (it mis-writes the path); left unset, the asset stays at the project root. Verify with `gm-cli resourcetool eval "CHECK PROJECTPATH=gems.yyp"`, then `gm-cli compile`.

After the asset exists, edit its `.js`/`.yy` freely. **Renaming or deleting** an asset must also go through the IDE or `resourcetool`, never by moving/removing files manually — to delete: `gm-cli resourcetool eval "RESOURCE DELETE NAME=<name> TYPE=Script"` (removes it from `gems.yyp` and deletes its `scripts/<name>/` folder).

## Code Style & Conventions

- **Language**: JavaScript (GMRT JS runtime), not GML. All scripts in `scripts/` use `.js`.
- **Script naming**: PascalCase directory and filename matching the global the script exposes (e.g. `scripts/World/World.js`). Intentional exceptions: the `cameraFollow`/`cameraFollow2d` factories (camelCase functions) and the `utils` grab-bag.
- **Global exposure**: Scripts expose globals via `globalThis.Name = ...`. Components are string tokens; systems and classes use the forms below.
- **ECS bootstrap**: Each scene owns its `World` (`this.world = new World(maxEntities, tickrate, opts)`). There is no `WORLD`/`MAX_ENTITIES` global.
- **Formatter**: [Prettier](https://prettier.io/) with `{ "bracketSameLine": true }` (MDN config). Working tree is CRLF (`core.autocrlf=true`); run `prettier --end-of-line crlf`. `.d.js` stubs and `Build/`/`.gmcache/` are in `.prettierignore`.

## GMRT-Safe Idioms

The GMRT JS runtime/compiler miscompiles or chokes on several standard JS forms. These have each caused real, hard-to-diagnose breakage — avoid them, don't "clean up" code back into them, and prefer the listed idiom:

- **No `for...of` over a Map/Set iterator** (`map.values()`/`.keys()`/`.entries()`, or a `Set`) — it *breaks* the runtime. Keep parallel arrays and index-loop them (see `World._keys`/`_storages`). `for...of` over a plain **array** or string is fine; `for...in` over a plain **object** is fine. (Probed 2026-06-12: now hard-crashes the run rather than the original *hang* — either way, never use it.)
- **No array destructuring in `for...of`** (`for (const [a, b] of arr)`) — `ReferenceError` at runtime (probe-confirmed 2026-06-12). Use index access (`arr[i][0]`). (Object destructuring `const {x,y} = o` and destructuring in a `.forEach(([a,b]) => …)` callback param *are* fine — see `Input.import`.)
- **No empty `for` initializer** (`for (; c < n; c++)`) — *crashes the compiler* (`NullReferenceException` in `jsc.Parser.ASTVisitor.VisitFor`; probe-confirmed 2026-06-12). Use a `while` loop.
- **Don't cache a primitive boolean in a local across a function** — it can get clobbered mid-function (a `const` flips `true`→`false` in one call). Cache the **component object** and read the property live each use (see `PlatformerController.update` reading `groundedComp.isGrounded`).
- **Top-level bare `const` is not visible to other scripts** — share via `globalThis.Name`. Bare top-level `function` declarations are *mostly* global, **but past a certain file size GMRT stops hoisting some of them into global scope and faults at startup** (`cannot coerce undefined or null value into object`). Assign factories/helpers explicitly — `globalThis.X = function X(…)` — and keep files small (the GemsUI kit was split into `GemsTheme`/`GemsContainers`/`GemsWidgets`/`GemsControls` for this reason).
- **Class getters/setters DO work** — a `get x()`/`set x()` accessor fires correctly on GMRT 0.19 (verified by probe: getter returns its computed value, setter mutates and reads back; `UISelect` ships with `get index/value/name` and works). The earlier "getters never fire" claim was a misdiagnosis — the `UIStepper` failure it was pinned on was the **large-file global-hoisting fault** (above), not the getter. Use getters freely; the only reason to inline (as `UIStepper` does) is style, not a runtime constraint.
- **Guard `!(pos.width > 0)` before drawing filled geometry/sprites in a UI component** — on the first frame after a scene transition the flexpanel layout isn't computed yet, so `getLayoutPosition()` returns NaN width/height; drawing roundrects/sprites with NaN coords faults. Test `> 0`, not `<= 0` (`NaN <= 0` is `false`, so the naive guard misses it) — see `UIStepper`/`UISlider`/`UIProgress`/`UISelect`/`UICheckbox`/`UIInput`. **Do NOT add this guard to text-drawing components** (`UIText`, or anything that self-sizes its element via `setWidth` in `onUpdate`): runtime `flexpanel` mutation is a no-op on 0.19, so such elements legitimately run at width 0 forever, and the guard would suppress their draw permanently. `draw_text` tolerates a 0/NaN width (it draws at `pos.left/top`; width only affects centering), so text drawers need no guard.
- **`JSON.stringify` faults on nested objects/arrays** — `JSON.stringify(["a","b"])` and a flat `{key: scalar}` object are fine (see `Settings`), but an object whose value is an object/array *hard-faults*. Persist only flat `{key: scalar}` blobs; serialize structure to a scalar string yourself (`ids.join(",")`, `"k=v;k=v"`) — see `SaveData`/`Profile`/`Achievement`. (`LevelSerializer.save`'s `JSON.stringify(data, null, 2)` is dead code — don't trust it as proof.)
- **GMRT 0.19 does not support SVG sprites** (e.g. `spr_choo`, `spr_play`, `spr_hana`) — `sprite_get_number()` returns `0`, so frame math can go negative and `draw_sprite_ext` throws *"Trying to draw negative subimage index on a non-instance"*. Use raster sprites; clamp any computed frame count to `≥ 1` and `subimg` to `≥ 0` (see `AnimationSystem`).
- **`view_camera[]` is not exposed in the GMRT JS runtime** — indexing it faults (probe-confirmed 2026-06-12: throws catchable `Error: unhandled type (13) for JS_ToObject`). Hold the `Camera` instance and read `camera_get_view_*(camera.id)` (see `sceneTopDown.draw`).
- **`gpu_set_scissor`/`gpu_get_scissor` leaks globally** — the clip state set for one element bleeds onto every subsequent UI draw, so a wrong/missed restore makes the *whole scene* go invisible (hit while clipping `UIInput`'s text). Don't use it to clip; clip by computing the visible substring/offset yourself and drawing only what fits (see `UIInput.onDraw`).
- **UI timers/easing must use `Time.raw`, not `Time.delta`** — `Time.delta` is scaled by `Time.scale`, so UI on it freezes/slows when a sim dilates or pauses time. Use `Time.raw` (wall-clock) for hover/press fades, caret blink, key-repeat, toggle easing (see `UIButton`, `UIInput`, `UICheckbox`).
- **Class inheritance / `super` is broken** (probe-confirmed 2026-06-12) — `super.method()` is a **compile error** (`Unsupported expression [R_SUPER]`), not a runtime fault; don't design with subclassing. Model "kinds of X" as **composition**: a flat base class carrying a `components: []` array of standalone data classes queried by `instanceof` (the `UIElement` `addComponent`/`getComponent(Class)` pattern, also `Item` → `Equippable`/`Weapon`). `instanceof` against a *flat* class works fine; only inheritance breaks. W3 used a free `teardownScene(this)` helper instead of a `GameScene` base for this reason.

When a quirk forces an unusual idiom, leave a one-line comment so it isn't "fixed" back. New quirks discovered during work should be added here.

> **Probe coverage (2026-06-12):** the bullets above were isolated-tested via a throwaway probe (battery in `obj_game/Create_0` + a temp script for module-scope/cross-unit cases) and all reproduced. Five earlier claims could *not* be reproduced and were removed — regex `.replace()`, `clipboard_has_text()` "always false", a static method calling a sibling static, nested-function locals inside a top-level IIFE, and multi-declarator `const` — all worked correctly in event **and** script context; re-add them only if they resurface. Not isolated-probed (design rules / need game state, left as-is): boolean-local clobber, large-file global-hoisting fault, NaN-width UI guard, `gpu_set_scissor` leak, `Time.raw` UI-timer rule.

## Architecture

### Demo Layer — `obj_game` & `Scene`

`obj_game` is the unified controller — it drives both global system ticks and scene lifecycle.

```
Create_0 → display/GPU setup; Log.clear/info; Settings defaults + load; I18n.load for `Settings.language`; opens SCENES.title
Draw_0   → draw_clear(background), scene.draw()
Step_0   → Time.update(), UI.update(), pending scene transition, scene.step(), Log.flush()
Draw_75  → UI.draw(), Tooltip.draw(), F5 screenshot
CleanUp  → scene.destroy(), UI/Input/I18n cleanup
```

**`Scene`** (`scripts/Scene/Scene.js`) is the base class for all demo scenes (`label`, `create()`, `step()`, `draw()`, `destroy()`). Scenes are **factory functions** returning a fresh instance each time they open. `create(openScene)` receives the navigation callback; `destroy()` tears down UI and resources.

**Scene navigation**: call the `openScene(factory)` callback to queue a transition (applied after the current UI update completes). **Built-in scenes** (`scripts/sceneLobby/sceneLobby.js`) live on `SCENES`: `.title`, `.lobby`, `.settings`, `.credits`. The app starts at `SCENES.title`.

**`SceneRegistry`** (`scripts/demo/demo.js`) is the lobby catalogue. Register at the top level of a scene's script:

```js
SceneRegistry.add(() => new MyScene(), { label: "My Scene", category: "SCENE_CAT_FOO" });

class MyScene extends Scene {
  label = "My Scene";
  create(openScene) { /* build UI; openScene(SCENES.lobby) to go back */ }
  destroy() { /* remove UI, clean up */ }
}
```

`SceneRegistry.byCategory()` returns entries grouped by category string. To add a scene: create the script asset (see Asset Creation), define the class, then `SceneRegistry.add(...)`.

**GemsUI kit** (`scripts/GemsTheme`, `GemsContainers`, `GemsWidgets`, `GemsControls` — split out of `demo.js`, which now holds only `SceneRegistry` + `teardownScene`): a themed factory library so scenes build UI declaratively instead of hand-wiring `UIElement`/`UIPanel`/`UIText`. Every factory is assigned via `globalThis.X = function X(…)` (not a bare declaration) and the kit is split across small files — both to dodge the GMRT large-file global-hoisting fault (see GMRT-Safe Idioms). All visual constants live in **`globalThis.GemsTheme`** (colors as hex strings, geometry as numbers); the `gems*` free functions parse + compose them. Containers: `gemsRoot(opts?)` (full-screen scene root), `gemsList(opts?)` (vertical stack), `gemsGrid(opts?)` (horizontal wrap row), `gemsPanel(opts?)`/`gemsCard(opts?)` (rounded panel; card adds gradient+border+shadow), `gemsHeader(title, opts?)` (title bar), `gemsSection(title, opts?)` (titled card with divider), `gemsRow(label, control, opts?)`, `gemsDivider(opts?)`. Widgets: `gemsLabel(label, opts?)`, `gemsHint(label, opts?)` (one-line help text on a readable card — use instead of a bare `gemsLabel` for overlays that would otherwise float over a scene's render), `gemsButton(label, onClick, opts?)` (`opts.primary` → accent CTA), `gemsIconButton(sprite, onClick, opts?)`, `gemsToggle(label, getValue, onToggle, opts?)` (renders `label: ON/OFF` as a button), `gemsCheckbox(label, getValue, onToggle, opts?)` (visual toggle; `opts.style` `"check"`/`"switch"`), `gemsProgress(getValue, opts?)` (non-interactive 0–1 bar; `opts.label` centered), `gemsSlider(key, min?, max?, step?, opts?)` + `gemsSelect(key, items, opts?)` (Settings-bound), `gemsSelectCustom(items, index, onChange, opts?)`. **Tooltips**: `gemsTooltip(element, label, opts?)` attaches a hover `UITooltip` (at index 0) and returns the element; every interactive widget factory also takes `opts.tooltip` (string or `() => string`) as a shortcut. `label`/`onText`/`offText` accept a string or `() => string` (live `I18n.textRef`); color opts accept a `GemsTheme` key, hex string, or raw color int. Styling lives only in `GemsTheme` + `UIPanel` — `UIPanel` options: `color2` (an edge tint; `draw_roundrect`'s two colors run **center→edge/radial**, not top→bottom), `border`/`borderColor`, soft multi-pass `shadow`/`shadowColor`/`shadowAlpha`, and `highlight`/`highlightColor`/`highlightAlpha` (inner top-bevel sheen) — all default off, so existing callers are unchanged. `UIButton` eases color/border-glow/shadow between hover/press states (`Time.raw` lerp — UI ignores `Time.scale`); `UISlider`/`UISelect`/`UIProgress`/`UICheckbox` render directly in `onDraw` (no absolute-positioned child panels — those relied on the unreliable per-frame `flexpanel` style setters, bug #15065) — `UISelect` shows `< value >` arrows and steps back/forward by click side. The UI build-out is tracked in `UI_ROADMAP.md` (with `FLEXPANEL.md` as the flexpanel property reference). **`teardownScene(scene)`** releases the `world`/`renderer`/`camera`/`ui` a scene holds on `this`, in dependency order (missing fields skipped) — call it from `destroy()` after releasing scene-specific resources (controllers, levels).

### ECS Core — `World`

`World` (`scripts/World/World.js`) is the instance-based ECS core, owning all component storage and the generational ID allocator. Each scene holds its own as `this.world` (there is no `WORLD` global). **`Entity` is deprecated** — its functionality moved to `World`.

```js
const world = new World(maxEntities, tickrate, opts); // opts: { gravity? } overrides GravitySystem.strength

// Entity lifecycle
const id = world.create();   // allocate generational ID
world.remove(id);            // mark for removal (deferred)
world.flush();               // commit queued removals
world.isValid(id);           // generational validity check

// Component storage
world.register(Position);                       // allocate storage (optional; add auto-registers)
world.add(id, Position, { x: 0, y: 0, z: 0 });  // set data
world.get(Position, id);                         // → data object or undefined
world.detach(id, Position);                      // remove one component

world.query(Position, Velocity);          // → ids that have ALL listed components
world.forEach([Position, Velocity], fn);  // calls fn(id) per match, no id array allocated

// Fixed-rate tick
const ticks = world.update(); // # ticks to run this frame; advances accumulator, computes alpha
world.alpha;                  // [0, 1) interpolation factor for rendering
world.maxTicks;               // tick cap per frame (default 5) — spiral-of-death guard:
                              // under overload the sim slows instead of freezing

// Snapshot
world.export();  // plain object, components keyed by string token, sparse entries
world.import(s); // restores ids + registered components; unknown keys ignored
```

### `IdPool`

`IdPool` (`scripts/IdPool/IdPool.js`) is the generational ID allocator owned by `World` as `world.ids`. IDs encode index (lower 20 bits) + generation (upper 12 bits). Static helpers: `IdPool.getIndex(id)`, `IdPool.makeId(index, gen)`, `IdPool.getGeneration(id)`. Instance methods (`world.ids.*`): `alloc()`, `free(id)`, `isValid(id)`, `reset()`, `export()`, `import()`.

### Component Pattern

Components are **string tokens** — a global name used as a `Map` key and for serialization. Data shape is defined at the call site; there are no static arrays, `defineComponent`, or static component classes (all deprecated).

```js
globalThis.Position = "Position";
/** @typedef {Object} Position @property {number} x @property {number} y @property {number} z */
// usage: world.add(id, Position, { x, y, z })
```

### System Pattern

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

### Fixed-Rate Simulation (ECS Scene Pattern)

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

**Motion integrators are exclusive per body**: `MovementSystem` integrates *free* movers (no collision response), `SolidSystem` is move-and-collide for solid bodies, `ProjectileSystem` is move-and-raycast for projectiles. A given mover is integrated by exactly one of them.

**`Time`** (`scripts/Time/Time.js`): `Time.delta` (scaled seconds), `Time.raw` (wall-clock), `Time.scale` (time dilation). Updated by `obj_game` in `Step_0` before `scene.step()` — always available in scene code.

### Genre Controllers & Template Gameplay Systems

The Core systems above are genre-agnostic. A playable genre scene layers a **controller** plus **gameplay systems** on top — these live under **Templates** (in the genre's folder) and are orchestrated by the scene's `step()`, not auto-run by `World`.

**Genre controllers** (`PlatformerController`, `TopDownController`) own player input registration + entity setup and expose a three-phase lifecycle, not an `update(world)`:
- `create(world, spawn)` — registers the keymap (`Input.bindAll`), spawns the player entity, returns a plain `ctrl` state bag (`{ id, facing, ... }`).
- `pollInput(ctrl)` — call **once per frame, before `world.update()`**, outside the tick loop. Samples *edge-triggered* input (jump `pressed()`/`released()`) into buffers so presses aren't lost on 0-tick frames or double-counted on multi-tick frames.
- `update(world, ctrl)` — call **once per physics tick**. Reads *continuous* input (movement) and applies acceleration/jump to `Velocity` (before `SolidSystem` integrates it).
- `destroy()` — unregisters input. Plus genre verbs like `respawn`, `setPower`, `tryFireball`.

See the **GMRT boolean-local clobber** note in memory: read flags like `Grounded.isGrounded` live off the component each use — caching a primitive bool in a local is miscompiled.

**Template gameplay systems** are stateless `globalThis` objects like Core systems but expose *named query/resolve methods* (not `update(world)`), called explicitly from `step()` after physics resolves: `EnemySystem` (`update` patrol + `resolveStomp`), `CollectibleSystem` (`collect`, `collectPowerup`, `reachedGoal`, `reachedCheckpoint`, `hitSpike`), `BlockSystem` (`resolveHit` — hit-from-below `?`-blocks/bricks, takes the pre-physics `vel.y`). They read `col.hits` (filled by `TriggerSystem`) or do their own overlap test, and return values the scene applies to score/state.

`scenePlatformer` is the reference orchestration: per tick → `snapshot` → `controller.update` → capture pre-physics `vel.y` → `physics` Pipeline → `EnemySystem` → resolve stomp/spike/death → collect coins/powerups/checkpoint/goal → `flush`. Multi-level scenes use an `_initLevel(index)` / `loadLevel(index)` pattern (rebuild `world`, level, controller, pipeline, renderer, camera per level); cumulative score/coins persist across levels on the scene.

**Lobby categories** are `SCENE_CAT_*` i18n keys: `ACTION`, `RPG`, `STRATEGY`, `MAP`, `BENCHMARK`. `SceneRegistry.add(factory, { label, category })` slots a scene under one.

### Built-in Systems

| System | File | Description |
|--------|------|-------------|
| `GravitySystem` | `scripts/GravitySystem/` | Applies `strength * direction * tickDuration` to entities with `Velocity`. `world.gravity` overrides `GravitySystem.strength`. Configurable: `.strength`, `.direction`. |
| `MovementSystem` | `scripts/MovementSystem/` | Integrates `Velocity` into `Position` each tick. For *free* movers with no collision response; solid bodies are integrated by `SolidSystem` instead. |
| `SolidSystem` | `scripts/SolidSystem/` | Discrete "move-and-collide" for dynamic solid bodies vs `kinematic` solids. Integrates each body's `Velocity` itself, sub-stepped (`SolidSystem.maxStep`, default 8) so fast movers can't tunnel, resolving per axis (wall-slide for free). Sets `Grounded.isGrounded` when a body is pushed up out of a downward move — replaces the old `GroundedSystem`. Requires `Collision` (solid, non-kinematic), `Position`, `BBox`, `Velocity`. `Grounded = { isGrounded }` (`scripts/Grounded/`). |
| `SeparationSystem` | `scripts/SeparationSystem/` | Equal-mass MTV push-apart between dynamic solid bodies (unit crowding). `SeparationSystem.iterations` passes per tick so dense clusters settle. Pure resolution — run after `SolidSystem`. Uses `world.broadphase` if set (see `Broadphase`); otherwise O(n²) per iteration. |
| `TriggerSystem` | `scripts/TriggerSystem/` | Overlap detection → fills/clears `col.hits` for game logic (sensors, pickups). Detection only; records pairs where at least one side is non-solid. Owns `col.hits`. Uses `world.broadphase` if set (see `Broadphase`); otherwise O(n²). |
| `ProjectileSystem` | `scripts/ProjectileSystem/` | Move-and-raycast for `Projectile` entities: casts the per-tick segment via `Raycast`, applies `Projectile.damage` to a hit `Health` (despawns it at ≤ 0 hp), then despawns the bullet. Range bounded by `Lifetime`. `Projectile = { damage, owner }`. |
| `StateSystem` | `scripts/StateSystem/` | State machine. `StateSystem.change(world, id, schema, force?)` queues; `update(world)` processes. `StateSchema = { enter?, update?, finish? }`. |
| `LifetimeSystem` | `scripts/LifetimeSystem/` | Decrements `lt.ticks` each tick; `world.remove(id)` when `≤ 0`. |
| `InterpolationSystem` | `scripts/InterpolationSystem/` | Render-interpolation bookkeeping. `snapshot(world)` records each mover's `Position` into `PrevPosition` (`scripts/PrevPosition/`) — call at the **top of each tick**, before any system moves `Position`. Renderers then draw at `PrevPosition + (Position − PrevPosition) * world.alpha` to keep fixed-step motion smooth when display refresh ≠ tickrate. Tracks `Velocity` movers only; static bodies fall back to `Position`. |
| `PathfindingSystem` | `scripts/PathfindingSystem/` | `setGrid(grid)`, `update`, `invalidate`, `current(world, id)`, `advance(world, id)`. See Pathfinding Flow. |

### Pathfinding Flow

1. `world.add(id, PathRequest, { startX, startY, goalX, goalY })` — request in grid coords.
2. `PathfindingSystem.update(world)` resolves → writes `PathResponse: { path, index }` (`index` = cursor).
3. `PathfindingSystem.current(world, id)` → current waypoint `{x, y}` or `undefined`.
4. `PathfindingSystem.advance(world, id)` → `true` if more waypoints remain; `false` (and detaches `PathResponse`) when complete.
5. After any grid change: `PathfindingSystem.invalidate(world)` — detaches all `PathResponse`.

### Level & Map Layers

`Level` (`scripts/Level/Level.js`) manages the tile grid and pathfinding grid, **separate from `World`** (the ECS).

```js
const LEVEL = new Level({ cellWidth: 32, cellHeight: 32 });            // cols/rows derived from room size
const terrain = new TileLayer(LEVEL.cols, LEVEL.rows, { emptyCost: Infinity }); // blocking base
LEVEL.insert(terrain);                 // append a LevelLayer (LEVEL.remove to detach)
PathfindingSystem.setGrid(LEVEL.mpg);  // wire up after layers are ready
LEVEL.syncAll();                       // recompute all pathfinding costs (or syncAt(x, y) for one cell)
PathfindingSystem.invalidate(world);   // call separately after any grid change
LEVEL.worldToGrid(wx, wy); LEVEL.gridToWorld(gx, gy); // ↔ { x, y } (gridToWorld returns cell center)
```

**`LevelLayer` interface**: `get(x,y)`, `set(x,y,v)`, `getNavData(x,y) → { cost }`, `export()`, `import()`, `destroy()`. The one built-in is **`TileLayer`** (`scripts/TileLayer/`), wrapping a `Grid` of **`TileType`** values. Later-added layers have higher nav-cost priority. Empty cells report the layer's `emptyCost`: `undefined` (default) passes through to lower layers; `Infinity` makes a blocking base. `TileType` (`scripts/TileType/`) holds `{ id, name, pathCost }` (`pathCost: null` → `Infinity`, default `1`). The former `Floor`/`Terrain`/`Structure` layers and their value classes are consolidated into `TileLayer`/`TileType`.

### Renderer

`Renderer` (`scripts/Renderer/Renderer.js`) is an ordered list of `RenderPass` objects (`{ draw(world), destroy() }`). `insert(pass, index?)` / `remove(pass)` manage the list; `draw(world)` runs every pass; `destroy()` tears them down. Each scene owns its renderer and calls `this.renderer.draw(this.world)` in `draw()`.

Built-in passes:
- **`RenderEntity`** — draws entities with `Visual` + `Position` via `draw_sprite_ext`. Interpolates between `PrevPosition` and `Position` by `world.alpha` when present (see `InterpolationSystem`); falls back to raw `Position` otherwise.
- **`RenderTileMap`** (`new RenderTileMap(layer, level, sprite, opt?)`) — hardware-accelerated tiles via `VertexBuffer`. `opt`: `{ autotile: 0|16|47|"dual", alpha, color, softEdge }`. Call `.markDirty()` after tile changes to rebuild the VBO. Autotile: `0` = raw frame id, `16` = blob4, `47` = blob8, `"dual"` = dual-grid corner sampling. Neighbor bits: `N=1, E=2, S=4, W=8` (blob8 adds `NE=16, SE=32, SW=64, NW=128`), so a blob4 tileset's frame index equals its cardinal-neighbor mask. `spr_tile16` is the project's 16-frame blob4 tileset; the **Tile Inspector** scene (`scripts/sceneTileInspect/`) lays out all 16 frames against this rule to validate frame order (`sceneTileInspect47` does the same for the 47-frame blob8 set).
  - **`"dual"` (dual-grid)** — the blob modes draw one centered tile per *filled cell* and cannot show two materials meeting (binary occupancy: a 2×2 filled block renders as a donut with blob4). Dual-grid instead renders a half-cell-**offset** grid where each display tile samples the 4 cells touching a grid *corner*; corner bits `TL=1, TR=2, BR=4, BL=8` → 16-frame index = mask (like blob4 but corner-keyed). Because a tile's empty corners stay transparent, **stacking several `"dual"` passes — one `TileLayer` per terrain, lowest priority first** — makes each upper terrain's border reveal the one beneath it, i.e. RPG-Maker-style A-over-B transitions with only a 16-frame corner tileset per terrain (no hand-drawn transition art). This is how the project supports *terrain-to-terrain* blending; the priority stack is just ordered `Renderer` passes (no new class). Validate corner art with `sceneTileInspectDual`; see `sceneTileTerrain` (water < sand < grass) for the reference composition. `softEdge` is ignored in dual mode. `spr_tiledual` is the project's 16-frame corner tileset (frame N fills the corners of mask N); both dual demos use it.
- **`RenderDebugEntity`** — `BBox` outlines (lime) + `Name` labels (white) for all entities with `Position`. Interpolates via `PrevPosition` + `world.alpha` like `RenderEntity`.
- **`RenderDebugPath`** (`new RenderDebugPath(level)`) — active `PathResponse` paths (yellow) + pending `PathRequest` goals (red cross).
- **`RenderDebugTileMap`** (`new RenderDebugTileMap(level, opt?)`) — overlay: cost shading, grid lines, tile id/name + coordinate labels. `opt`: `{ grid, cost, tiles, coords, names, color, alpha, font }`. Call `level.syncAll()` first.

**`VertexBuffer`** (`scripts/VertexBuffer/`) wraps GameMaker vertex buffers with a fixed `position + texcoord + colour` format: `.begin()`, `.addQuad(x,y,w,h,u0,v0,u1,v1,color?,alpha?)`, `.addQuadV(...)` (per-corner alpha), `.end(freeze?)`, `.submit(texture)`, `.destroy()`.

### UI System

- **`UIElement`** (`scripts/UIElement/`): tree node backed by `flexpanel` (GameMaker Flexbox). `insertChild`, `removeChild`, `addComponent(c)`, `getComponent(Class)`, `getComponents(Class)`, `removeComponent(c)`. `markDirty()` propagates to root; `refresh()` calls `flexpanel_calculate_layout`.
- **`UI`** (`scripts/UI/`): static root registry. `UI.insert(root, index?, enabled?)`, `UI.remove(root)`, `UI.setEnabled(root, bool)`. `update()` traverses in reverse (highest index blocks lower); `draw()` forward.
- **`UIComponent` interface**: `{ onUpdate?(element, block), onDraw?(element), onDestroy?(element) }`. Built-ins: `UIButton`, `UIText`, `UIImage`, `UIPanel`, `UITrigger`, `UISlider`, `UISelect`, `UIInput`, `UIProgress` (non-interactive 0–1 fill bar), `UICheckbox` (visual toggle; `style:"check"` box+tick or `"switch"` pill+knob), `UITooltip` (self-contained hover tooltip — detects its own hover via `positionMeeting`+`block`, no `UITrigger` needed; feeds the global `Tooltip` past a dwell delay).
- **`Tooltip`**: standalone static class (not a `UIComponent`). `Tooltip.set(str)` from anywhere; renders once per frame at mouse position via `Tooltip.draw()` in `Draw_75`.
- Many `flexpanel_node_style_*` calls in `UIElement` are commented out pending GameMaker bug [#15065](https://github.com/YoYoGames/GameMaker-Bugs/issues/15065). Don't uncomment until resolved.

### Input System

**`Input`** / **`InputAction`**: `Input.register(key, action)`, `Input.get(key)` → `InputAction`. Query: `.down()`, `.pressed()`, `.released()`, `.value()`. Bind: `.bindButton(source, button)` / `.bindAxis(mode, axis)`. Bulk: `Input.bindAll({ key: [source, button], … })` registers a whole keymap in one call; `Input.unbindAll([keys])` removes them — used by the genre controllers.

### `EntityPreset`

`EntityPreset` (`scripts/EntityPreset/`) spawns entities from named presets:

```js
EntityPreset.register([{ id: "enemy", components: { Velocity: { x: 0, y: 0, z: 0 }, Lifetime: { ticks: 120 } } }]);
const id = EntityPreset.spawn("enemy", world, x, y, z);
EntityPreset.has("enemy"); EntityPreset.get("enemy"); // → boolean / preset or undefined
```

### `Query` — Spatial Entity Lookup

`Query` (`scripts/Query/`) searches entities with `Position`:

```js
Query.nearest(world, x, y, opts);          // → id or -1
Query.farthest(world, x, y, opts);         // → id or -1
Query.inRect(world, x1, y1, x2, y2, opts); // → id[]
Query.inRadius(world, x, y, radius, opts);  // → id[]
```

`opts`: `{ tag?, maxDist?, hasCollision? }`. `tag` filters by `Tag` component (`{ tags: Set }`).

### Utility Modules

- **`Settings`**: persists to `settings.json` (`Settings.PATH`). `registerDefaults({...})` before `load()` at startup (calls merge additively). `get(key)` falls back to defaults; `set(key, val)` updates memory; `save()` writes only keys present in defaults.
- **`Color`**: `Color.rgb(r,g,b)`, `Color.hsv(h,s,v)`, `Color.merge(c1,c2,t)`, `Color.parse("#rrggbb")` → GameMaker color ints; `Color.alpha(color)` → alpha byte `[0,1]`.
- **`I18n`**: `I18n.load(manifestPath)` reads a `manifest.json` listing text-file masks (e.g. `text/*.json`), fonts, images, sounds; flat `{ key: value }` text JSON is merged into `I18n.texts`. `I18n.text(key, ...params)` or `I18n.textRef(...)` (a `() => string` for live-updating UI labels); fonts via `I18n.font(key)`. Ships `en-US` (default, loaded in `obj_game` `Create_0`; no manifest fonts → falls back to the built-in draw font, which can't render Korean) and `ko-KR` (Noto Sans KR, SIL OFL 1.1). Strings are split by genre under each locale's `text/`: `common`, `platformer`, `topdown`, `rts`, `benchmark`, `map` (the `text/*.json` mask merges them all). Fonts are keyed by role, not size: `default` (Regular 12), `header` (Bold 16), `description` (Regular 10). en-US declares no fonts, so all three `I18n.font(...)` keys resolve to the built-in draw font.
- **`Camera`** / **`cameraFollow`** / **`cameraFollow2d`**: `Camera` wraps a `camera_*` handle (ORTHO, PERSPECTIVE, PERSPECTIVE_FOV). `cameraFollow({ world, followTarget, followLerp?, followHeight?, ... })` — 3D perspective follow; `cameraFollow2d({ world, followTarget, followLerp?, width?, height?, ... })` — 2D orthographic (pixel-snapped). Both read the target's `Position` from `world`. Call `.update()` each step and `.assign(viewIndex)` to attach to a viewport.
- **`MotionPlanner`**: static A* on `MotionPlanningGrid`. `MotionPlanner.plan(start, goal, algorithm?, opt?)` → `{x,y}[]`. Options: `allowDiag`, `cornerCutting`, `heuristicWeight`, `maxIter`.
- **`AABB`**: world-space box geometry that owns the non-uniform `BBox`-anchor convention (see Component Pattern note). `AABB.edges(pos, box)` / `AABB.of(world, id)` → `{ x1, y1, x2, y2, cx, cy }`; `AABB.overlap(a, b)` → strict overlap (touching edges don't count). Every collision/geometry system derives edges through this, never inline `pos.x + box.x` — consumers: `SolidSystem`, `SeparationSystem`, `TriggerSystem`, `BlockSystem`, `EnemySystem`, `Raycast`, `RenderDebugEntity`. (`Query` is *not* a consumer — it does point-vs-rect tests on `Position` only.)
- **`Broadphase`** (`scripts/Broadphase/`): Uniform-grid broadphase for O(n) physics pair queries. `new Broadphase(worldWidth, worldHeight, cellSize)` — `cellSize` must exceed entity full diameter so center-based bucketing guarantees all overlapping pairs are in adjacent cells. `clear()`, `insert(id, cx, cy)`, `pairs(fn)` (calls `fn(a, b)` per candidate pair, no duplicates). Assign to `world.broadphase` to opt `SeparationSystem` and `TriggerSystem` into the broadphase path; scenes without it fall back to O(n²). Apply selectively — crowd/RTS scenes benefit; scenes with few interacting bodies (platformer) don't need it.
- **`Raycast`**: static segment-vs-AABB cast over all collider entities. `Raycast.cast(world, x0, y0, x1, y1, opts)` → nearest hit `{ id, x, y, nx, ny, t }` or `null`. `opts`: `{ ignore?, solidOnly? (default true), mask? }`. Shared by `ProjectileSystem` (bullets) and line-of-sight queries.
- **`File`**: sync I/O. `File.find(mask)` → `string[]`, `File.read(fname)` → `string|undefined`, `File.write(fname, data)` → `boolean`.
- **`Log`**: text-based behavior verification (there are no tests). `Log.info/warn/error/debug(msg)` buffer timestamped lines; `obj_game` calls `Log.clear()` at startup and `Log.flush()` once per frame (only rewrites `game.log` when dirty). Read `game.log` to confirm runtime behavior without watching the window.
- **Global utils** (`scripts/utils/`): `noop()`, `uuid()` → UUID v4, `rem(value)` → pixel size relative to current font size.
