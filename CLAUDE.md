# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**G.E.M.S.** (GameMaker Entity & Map System) is a UI and entity management library for GameMaker 2026.0.0.15 on the GMRT runtime (0.19.0). All game logic is JavaScript, not GML. Scripts live in three IDE folders: **Core** (ECS, systems, level, render, UI, input, utilities), **Demo** (the runnable showcase — `obj_game`, scenes, UI helpers), and **RPG** (genre supplements; currently `RPG/cameraFollow`). RPG-genre demo scenes (e.g. `scripts/sceneTopDown/`) live under **Demo** and register in the lobby under `SCENE_CAT_RPG`.

The entire demo runs in a single room (`rm_game`) with `obj_game` as the unified controller — no room transitions.

## Working Guidelines

Bias toward caution over speed; for trivial tasks, use judgment.

- **Think first.** State assumptions; if uncertain or a request is ambiguous, ask rather than guess silently. Push back when a simpler approach exists.
- **Simplicity first (KISS).** Minimum code that solves the problem — no speculative features, single-use abstractions, unrequested configurability, or error handling for impossible cases. Fail fast rather than hiding errors.
- **Surgical changes.** Touch only what the task requires; match existing style; don't refactor or reformat unrelated code. Mention pre-existing dead code rather than deleting it; remove only what your own change made unused.
- **Verify by running.** There are no tests — confirm behavior by running the game (see Build & Run). For multi-step work, state a brief plan with a verification check per step.

## Build & Run

The project uses `gm-cli` (experimental GameMaker CLI) with the GMRT 0.19 toolchain. The project file is `gems.yyp`; the IDE (GameMaker 2026.0.0.15) can also build and run.

```sh
gm-cli run     --toolchain GMRT@0.19 gems.yyp                 # run
gm-cli compile --toolchain GMRT@0.19 gems.yyp                 # compile only
gm-cli compile --toolchain GMRT@0.19 --errors-only gems.yyp  # compile, errors only
```

## Asset Creation

**Never create GameMaker assets (scripts, objects, rooms, sprites) by hand-writing files/folders or editing the `Resources` list in `gems.yyp`.** GameMaker manages asset metadata strictly — manual edits corrupt the project or are silently ignored. Two valid routes:

**A. GameMaker IDE** — right-click a folder in the Asset Browser → Add Script / Add Object / etc.

**B. `gm-cli resourcetool`** (no IDE) — for a new script `<name>`:

```sh
gm-cli resourcetool eval "RESOURCE CREATE TYPE=Script NAME=<name>"                # registers it in gems.yyp
gm-cli resourcetool eval "RESOURCE SET EXPR=<name>.scriptSource VALUE=<name>.js"  # point at .js, not the .gml stub
```

Then delete the generated `scripts/<name>/<name>.gml` stub and `Write` `scripts/<name>/<name>.js`. To file the asset under an IDE folder, **edit the asset's own `.yy`** `parent` (`path: folders/<Folder>.yy`, `name: <Folder>`) to match a sibling — this is safe local metadata. Do **not** `RESOURCE SET` `.parent` (it mis-writes the path); left unset, the asset stays at the project root. Verify with `gm-cli resourcetool eval "CHECK PROJECTPATH=gems.yyp"`, then `gm-cli compile`.

After the asset exists, edit its `.js`/`.yy` freely. **Renaming or deleting** an asset must also go through the IDE or `resourcetool`, never by moving/removing files manually.

## Code Style & Conventions

- **Language**: JavaScript (GMRT JS runtime), not GML. All scripts in `scripts/` use `.js`.
- **Script naming**: PascalCase directory and filename matching the global the script exposes (e.g. `scripts/World/World.js`). Intentional exceptions: the `cameraFollow`/`cameraFollow2d` factories (camelCase functions) and the `utils` grab-bag.
- **Global exposure**: Scripts expose globals via `globalThis.Name = ...`. Components are string tokens; systems and classes use the forms below.
- **ECS bootstrap**: Each scene owns its `World` (`this.world = new World(maxEntities, tickrate, opts)`). There is no `WORLD`/`MAX_ENTITIES` global.
- **Formatter**: [Prettier](https://prettier.io/) with `{ "bracketSameLine": true }` (MDN config). Working tree is CRLF (`core.autocrlf=true`); run `prettier --end-of-line crlf`. `.d.js` stubs and `Build/`/`.gmcache/` are in `.prettierignore`.

## GMRT-Safe Idioms

The GMRT JS runtime/compiler miscompiles or chokes on several standard JS forms. These have each caused real, hard-to-diagnose breakage — avoid them, don't "clean up" code back into them, and prefer the listed idiom:

- **No `for...of` over a Map/Set iterator** (`map.values()`/`.keys()`/`.entries()`, or a `Set`) — it *hangs* the runtime. Keep parallel arrays and index-loop them (see `World._keys`/`_storages`). `for...of` over a plain **array** or string is fine; `for...in` over a plain **object** is fine.
- **No array destructuring in `for...of`** (`for (const [a, b] of arr)`) — `ReferenceError` at runtime. Use index access (`arr[i][0]`). (Destructuring in a `.forEach(([a,b]) => …)` callback param *is* fine — see `Input.import`.)
- **No empty `for` initializer** (`for (; c < n; c++)`) — *crashes the compiler* (`NullReferenceException` in `VisitFor`). Use a `while` loop.
- **Don't cache a primitive boolean in a local across a function** — it can get clobbered mid-function (a `const` flips `true`→`false` in one call). Cache the **component object** and read the property live each use (see `PlatformerController.update` reading `groundedComp.isGrounded`).
- **No nested-function locals/params inside a top-level IIFE** (`const X = (() => { … })()`) — they read as `not defined` at runtime. Precompute to literals.
- **Top-level bare `const` is not visible to other scripts** — share via `globalThis.Name`. Top-level `function` declarations *are* global (e.g. `makeButton`, `teardownScene` in `demo.js`).
- **Unverified, so avoid until tested:** `super.method()` / inherited-method dispatch (no existing usage — W3 used a free `teardownScene(this)` helper instead of a `GameScene` base for this reason).

When a quirk forces an unusual idiom, leave a one-line comment so it isn't "fixed" back. New quirks discovered during work should be added here.

## Architecture

### Demo Layer — `obj_game` & `Scene`

`obj_game` is the unified controller — it drives both global system ticks and scene lifecycle.

```
Create_0 → display/GPU setup; Log.clear/info; I18n.load, Settings defaults + load; opens SCENES.title
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

**UI helpers** (`scripts/demo/demo.js`): `makeButton(label, onClick)`, `makeSection(title)`, `makeRow(label, control)`, `makeSlider(key, min, max, step)`, `makeSelect(key, items)`. **`teardownScene(scene)`** releases the `world`/`renderer`/`camera`/`ui` a scene holds on `this`, in dependency order (missing fields skipped) — call it from `destroy()` after releasing scene-specific resources (controllers, levels).

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

Demo scenes compose these into a **`Pipeline`** (`scripts/Pipeline/`): `this.physics = new Pipeline().add(SystemA).add(stepFn)`, then `this.physics.update(world)` each tick. A step is any `{ update(world) }` object or a bare function. Per genre: platformer `Gravity → clampFall → SolidSystem`; top-down `SolidSystem → ProjectileSystem`; RTS `SolidSystem → SeparationSystem`.

**Motion integrators are exclusive per body**: `MovementSystem` integrates *free* movers (no collision response), `SolidSystem` is move-and-collide for solid bodies, `ProjectileSystem` is move-and-raycast for projectiles. A given mover is integrated by exactly one of them.

**`Time`** (`scripts/Time/Time.js`): `Time.delta` (scaled seconds), `Time.raw` (wall-clock), `Time.scale` (time dilation). Updated by `obj_game` in `Step_0` before `scene.step()` — always available in scene code.

### Genre Controllers & Demo Gameplay Systems

The Core systems above are genre-agnostic. A playable genre scene layers a **controller** plus **gameplay systems** on top — these live under **Demo** and are orchestrated by the scene's `step()`, not auto-run by `World`.

**Genre controllers** (`PlatformerController`, `TopDownController`) own player input registration + entity setup and expose a three-phase lifecycle, not an `update(world)`:
- `create(world, spawn)` — registers the keymap (`Input.bindAll`), spawns the player entity, returns a plain `ctrl` state bag (`{ id, facing, ... }`).
- `pollInput(ctrl)` — call **once per frame, before `world.update()`**, outside the tick loop. Samples *edge-triggered* input (jump `pressed()`/`released()`) into buffers so presses aren't lost on 0-tick frames or double-counted on multi-tick frames.
- `update(world, ctrl)` — call **once per physics tick**. Reads *continuous* input (movement) and applies acceleration/jump to `Velocity` (before `SolidSystem` integrates it).
- `destroy()` — unregisters input. Plus genre verbs like `respawn`, `setPower`, `tryFireball`.

See the **GMRT boolean-local clobber** note in memory: read flags like `Grounded.isGrounded` live off the component each use — caching a primitive bool in a local is miscompiled.

**Demo gameplay systems** are stateless `globalThis` objects like Core systems but expose *named query/resolve methods* (not `update(world)`), called explicitly from `step()` after physics resolves: `EnemySystem` (`update` patrol + `resolveStomp`), `CollectibleSystem` (`collect`, `collectPowerup`, `reachedGoal`, `reachedCheckpoint`, `hitSpike`), `BlockSystem` (`resolveHit` — hit-from-below `?`-blocks/bricks, takes the pre-physics `vel.y`). They read `col.hits` (filled by `TriggerSystem`) or do their own overlap test, and return values the scene applies to score/state.

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
- **`RenderTileMap`** (`new RenderTileMap(layer, level, sprite, opt?)`) — hardware-accelerated tiles via `VertexBuffer`. `opt`: `{ autotile: 0|16|47, alpha, color, softEdge }`. Call `.markDirty()` after tile changes to rebuild the VBO. Autotile: `0` = raw frame id, `16` = blob4, `47` = blob8. Neighbor bits: `N=1, E=2, S=4, W=8` (blob8 adds `NE=16, SE=32, SW=64, NW=128`), so a blob4 tileset's frame index equals its cardinal-neighbor mask. `spr_tile16` is the project's 16-frame blob4 tileset; the **Tile Inspector** scene (`scripts/sceneTileInspect/`) lays out all 16 frames against this rule to validate frame order.
- **`RenderDebugEntity`** — `BBox` outlines (lime) + `Name` labels (white) for all entities with `Position`. Interpolates via `PrevPosition` + `world.alpha` like `RenderEntity`.
- **`RenderDebugPath`** (`new RenderDebugPath(level)`) — active `PathResponse` paths (yellow) + pending `PathRequest` goals (red cross).
- **`RenderDebugTileMap`** (`new RenderDebugTileMap(level, opt?)`) — overlay: cost shading, grid lines, tile id/name + coordinate labels. `opt`: `{ grid, cost, tiles, coords, names, color, alpha, font }`. Call `level.syncAll()` first.

**`VertexBuffer`** (`scripts/VertexBuffer/`) wraps GameMaker vertex buffers with a fixed `position + texcoord + colour` format: `.begin()`, `.addQuad(x,y,w,h,u0,v0,u1,v1,color?,alpha?)`, `.addQuadV(...)` (per-corner alpha), `.end(freeze?)`, `.submit(texture)`, `.destroy()`.

### UI System

- **`UIElement`** (`scripts/UIElement/`): tree node backed by `flexpanel` (GameMaker Flexbox). `insertChild`, `removeChild`, `addComponent(c)`, `getComponent(Class)`, `getComponents(Class)`, `removeComponent(c)`. `markDirty()` propagates to root; `refresh()` calls `flexpanel_calculate_layout`.
- **`UI`** (`scripts/UI/`): static root registry. `UI.insert(root, index?, enabled?)`, `UI.remove(root)`, `UI.setEnabled(root, bool)`. `update()` traverses in reverse (highest index blocks lower); `draw()` forward.
- **`UIComponent` interface**: `{ onUpdate?(element, block), onDraw?(element), onDestroy?(element) }`. Built-ins: `UIButton`, `UIText`, `UIImage`, `UIPanel`, `UITrigger`, `UISlider`, `UISelect`, `UIInput`, `UITooltip`.
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
- **`I18n`**: `I18n.load(manifestPath)` reads a `manifest.json` listing text-file masks (e.g. `text/*.json`), fonts, images, sounds; flat `{ key: value }` text JSON is merged into `I18n.texts`. `I18n.text(key, ...params)` or `I18n.textRef(...)` (a `() => string` for live-updating UI labels); fonts via `I18n.font(key)`. Ships `ko-KR` (Noto Sans KR, SIL OFL 1.1), strings in `datafiles/i18n/ko-KR/text/ui.json`.
- **`Camera`** / **`cameraFollow`** / **`cameraFollow2d`**: `Camera` wraps a `camera_*` handle (ORTHO, PERSPECTIVE, PERSPECTIVE_FOV). `cameraFollow({ world, followTarget, followLerp?, followHeight?, ... })` — 3D perspective follow; `cameraFollow2d({ world, followTarget, followLerp?, width?, height?, ... })` — 2D orthographic (pixel-snapped). Both read the target's `Position` from `world`. Call `.update()` each step and `.assign(viewIndex)` to attach to a viewport.
- **`MotionPlanner`**: static A* on `MotionPlanningGrid`. `MotionPlanner.plan(start, goal, algorithm?, opt?)` → `{x,y}[]`. Options: `allowDiag`, `cornerCutting`, `heuristicWeight`, `maxIter`.
- **`AABB`**: world-space box geometry that owns the non-uniform `BBox`-anchor convention (see Component Pattern note). `AABB.edges(pos, box)` / `AABB.of(world, id)` → `{ x1, y1, x2, y2, cx, cy }`; `AABB.overlap(a, b)` → strict overlap (touching edges don't count). Every collision/geometry system derives edges through this, never inline `pos.x + box.x` — consumers: `SolidSystem`, `SeparationSystem`, `TriggerSystem`, `BlockSystem`, `EnemySystem`, `Raycast`, `RenderDebugEntity`. (`Query` is *not* a consumer — it does point-vs-rect tests on `Position` only.)
- **`Broadphase`** (`scripts/Broadphase/`): Uniform-grid broadphase for O(n) physics pair queries. `new Broadphase(worldWidth, worldHeight, cellSize)` — `cellSize` must exceed entity full diameter so center-based bucketing guarantees all overlapping pairs are in adjacent cells. `clear()`, `insert(id, cx, cy)`, `pairs(fn)` (calls `fn(a, b)` per candidate pair, no duplicates). Assign to `world.broadphase` to opt `SeparationSystem` and `TriggerSystem` into the broadphase path; scenes without it fall back to O(n²). Apply selectively — crowd/RTS scenes benefit; scenes with few interacting bodies (platformer) don't need it.
- **`Raycast`**: static segment-vs-AABB cast over all collider entities. `Raycast.cast(world, x0, y0, x1, y1, opts)` → nearest hit `{ id, x, y, nx, ny, t }` or `null`. `opts`: `{ ignore?, solidOnly? (default true), mask? }`. Shared by `ProjectileSystem` (bullets) and line-of-sight queries.
- **`File`**: sync I/O. `File.find(mask)` → `string[]`, `File.read(fname)` → `string|undefined`, `File.write(fname, data)` → `boolean`.
- **`Log`**: text-based behavior verification (there are no tests). `Log.info/warn/error/debug(msg)` buffer timestamped lines; `obj_game` calls `Log.clear()` at startup and `Log.flush()` once per frame (only rewrites `game.log` when dirty). Read `game.log` to confirm runtime behavior without watching the window.
- **Global utils** (`scripts/utils/`): `noop()`, `uuid()` → UUID v4, `rem(value)` → pixel size relative to current font size.
