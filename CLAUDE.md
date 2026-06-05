# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**G.E.M.S.** (GameMaker Entity & Map System) is a high-performance UI and entity management library for GameMaker 2026.0.0.15 using the GMRT runtime (0.19.0). All game logic is written in JavaScript (not GML). Scripts are organized into three IDE folders: **Core** (ECS, systems, level, render, UI, input, utilities), **Demo** (the runnable showcase — `obj_game`, scenes, UI helpers), and **RPG** (genre-specific supplements; currently the camera-follow helpers under `RPG/Camera`).

The entire demo runs in a single room (`rm_game`) with `obj_game` as the unified controller — no room transitions.

## Working Guidelines

Behavioral guidelines to reduce common coding mistakes. These bias toward caution over speed — for trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.** (See also the KISS principle below.)

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused; don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals with explicit checks. Since this project has no tests, verification is done by **running the game** (see Build & Run) and observing the behavior in question.

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Build & Run

The project uses `gm-cli` (experimental GameMaker CLI) with the GMRT 0.19 toolchain.

```sh
# Run the project
gm-cli run --toolchain GMRT@0.19 gems.yyp

# Compile only (no launch)
gm-cli compile --toolchain GMRT@0.19 gems.yyp

# Suppress non-error output
gm-cli compile --toolchain GMRT@0.19 --errors-only gems.yyp
```

The project file is `gems.yyp`. The `Build/` directory contains pre-built output artifacts. The IDE (GameMaker 2026.0.0.15) can also be used to build and run.

## Asset Creation

**Never create new GameMaker assets (scripts, objects, rooms, sprites, etc.) by manually creating files or editing `gems.yyp`.** GameMaker manages its project file and asset metadata strictly — manual edits corrupt the project or are ignored.

When a new asset is needed, **ask the user to create it via the GameMaker IDE** (right-click a folder in the Asset Browser → Add Script / Add Object / etc.). After the asset is created, the generated `.js` / `.yy` files can be edited freely.

## Code Style & Conventions

- **Language**: JavaScript (GMRT JS runtime), not GML. All scripts in `scripts/` use `.js` extension.
- **Script naming**: Scripts use PascalCase directory and filename matching the global they expose (e.g., `scripts/World/World.js`). Exceptions are intentional: the `cameraFollow`/`cameraFollow2d` factories (camelCase, they're functions) and the `utils` grab-bag. Renaming or deleting a script (folder, file, and `.yy` metadata) must be done in the GameMaker IDE, not by moving/removing files manually.
- **Global exposure**: Scripts expose globals via `globalThis.Name = ...`. Components use string tokens; systems and classes use the appropriate form below.
- **KISS principle**: Keep implementations simple. Avoid unnecessary exception handling — fail fast rather than hiding errors.
- **No tests**: Verification is done by running the game.
- **ECS bootstrap**: Each scene creates its own local `World` instance (`this.world = new World(maxEntities, tickrate, opts)`). `WORLD`/`MAX_ENTITIES` are not defined as project globals.
- **Formatter**: [Prettier](https://prettier.io/) with `{ "bracketSameLine": true }` (MDN config). The project is CRLF in the working tree (`core.autocrlf=true`); run `prettier --end-of-line crlf` so it doesn't rewrite line endings. `.d.js` stubs and `Build/`/`.gmcache/` are in `.prettierignore`.

## Architecture

### Demo Layer — `obj_game` & `Scene`

`obj_game` is the unified controller for the entire demo. It handles both global system ticks and scene lifecycle.

**Event order in `obj_game`:**

```
Create_0 → display/GPU setup; I18n.load, Settings defaults + load; opens SCENES.title
Draw_0   → draw_clear(background), scene.draw()
Step_0   → Time.update(), UI.update(), pending scene transition, scene.step()
Draw_75  → UI.draw(), Tooltip.draw(), F5 screenshot
CleanUp  → scene.destroy(), UI/Input/I18n cleanup
```

**`Scene`** (`scripts/Scene/Scene.js`) is the base class for all demo scenes:

```js
globalThis.Scene = class Scene {
  label = "";
  create() {}
  step() {}
  draw() {}
  destroy() {}
};
```

Scenes are **factory functions** that return a fresh `Scene` instance each time they are opened. `create(openScene)` receives the navigation callback; `destroy()` tears down UI and resources.

**Scene navigation** is via the `openScene(factory)` callback passed to `create()`. Calling it queues a transition applied after the current UI update completes.

**Built-in scenes** (`scripts/sceneLobby/sceneLobby.js`) live in the `SCENES` object: `SCENES.title`, `SCENES.lobby`, `SCENES.settings`, `SCENES.credits`. The app starts at `SCENES.title`.

**`SceneRegistry`** (`scripts/demo/demo.js`) is the catalogue for demo scenes shown in the lobby. Register from any script:

```js
SceneRegistry.add(
  () => new MyScene(),           // factory — called fresh on each open
  { label: "My Scene", category: "SCENE_CAT_FOO" }
);
```

`SceneRegistry.byCategory()` returns entries grouped by category string. Scenes implementing `create(openScene)` receive the callback so they can navigate back:

```js
class MyScene extends Scene {
  label = "My Scene";
  create(openScene) { /* build UI; call openScene(SCENES.lobby) to go back */ }
  destroy() { /* remove UI, clean up */ }
}
```

To add a scene: create the script asset in the IDE, define the class, then call `SceneRegistry.add(...)` at the top level of that script.

**UI helpers** available in `scripts/demo/demo.js`: `makeButton(label, onClick)`, `makeSection(title)`, `makeRow(label, control)`, `makeSlider(key, min, max, step)`, `makeSelect(key, items)`.

### ECS Core — `World`

`World` (`scripts/World/World.js`) is the instance-based ECS core. It owns all component storage and the generational ID allocator. **`Entity` is deprecated** — all functionality has moved to `World`.

```js
const world = new World(maxEntities, tickrate, opts);
// opts: { gravity? }  — overrides GravitySystem.strength for this world
```

(The examples below use a local `world` instance — there is no `WORLD` global; each scene holds its own as `this.world`.)

**Entity lifecycle:**

```js
const id = world.create();      // allocate generational ID
world.remove(id);                // mark for removal (deferred)
world.flush();                   // commit all queued removals
world.isValid(id);               // generational validity check
```

**Component storage:**

```js
world.register(Position);                    // allocate storage array (optional)
world.add(id, Position, { x: 0, y: 0, z: 0 }); // set data; auto-registers if needed
world.get(Position, id);                     // → data object or undefined
world.detach(id, Position);                  // remove one component
```

**Query** — returns entity IDs that have **all** listed components:

```js
const ids = world.query(Position, Velocity);
```

**Fixed-rate tick** — returns the number of ticks to run this frame:

```js
const ticks = world.update();   // advances accumulator, computes alpha
world.alpha;                     // [0, 1) interpolation factor for rendering
```

**Snapshot serialization:**

```js
const snapshot = world.export();   // plain object, sparse component entries
world.import(snapshot);            // restores ids + all registered components
```

`export()` keys components by their **string token**. `import()` iterates registered components and looks up each by token — unknown snapshot keys are silently ignored.

### `IdPool`

`IdPool` (`scripts/IdPool/IdPool.js`) is an instantiable generational ID allocator owned by `World` as `world.ids`. IDs encode an index (lower 20 bits) and a generation (upper 12 bits).

Static utility methods remain callable anywhere:
- `IdPool.getIndex(id)` — extract array index
- `IdPool.makeId(index, gen)` — reconstruct ID from parts
- `IdPool.getGeneration(id)`

Instance methods (`world.ids.*`): `alloc()`, `free(id)`, `isValid(id)`, `reset()`, `export()`, `import()`.

### Component Pattern

Components are **string tokens** — just a global name used as a `Map` key and for snapshot serialization:

```js
globalThis.Position = "Position";

/**
 * @typedef {Object} Position
 * @property {number} x
 * @property {number} y
 * @property {number} z
 */
```

Data shape is defined at the call site: `world.add(id, Position, { x, y, z })`. There are no static arrays, no `defineComponent`, no static component classes.

**`defineComponent` and the old static-class component pattern are deprecated.**

### System Pattern

Systems are **plain objects** with an `update(world)` method:

```js
globalThis.MovementSystem = {
    update(world) {
        const ids = world.query(Position, Velocity);
        for (const id of ids) {
            const pos = world.get(Position, id);
            const vel = world.get(Velocity, id);
            pos.x += vel.x * world.tickDuration;
            pos.y += vel.y * world.tickDuration;
        }
    },
};
```

Utility systems that are called on-demand (not every tick) — e.g., cursor methods on `PathfindingSystem` — expose named methods instead of `update(world)`.

### Fixed-Rate Simulation (ECS Scene Pattern)

For scenes that run an ECS simulation, dispatch systems explicitly inside `step()`:

```js
step() {
    const ticks = this.world.update();
    for (let t = 0; t < ticks; t++) {
        GravitySystem.update(this.world);
        MovementSystem.update(this.world);
        CollisionSystem.update(this.world);
        PathfindingSystem.update(this.world);
        StateSystem.update(this.world);
        LifetimeSystem.update(this.world);
        this.world.flush();
    }
}

draw() {
    this.renderer.draw(this.world);
}
```

**`Time`** (`scripts/Time/Time.js`): `Time.delta` (scaled seconds), `Time.raw` (wall-clock seconds), `Time.scale` (time dilation). Updated by `obj_game` in `Step_0` (before `scene.step()`) — always available in scene code.

### Built-in Systems

| System | File | Description |
|--------|------|-------------|
| `GravitySystem` | `scripts/GravitySystem/GravitySystem.js` | Applies `strength * direction * tickDuration` to all entities with `Velocity`. `world.gravity` overrides `GravitySystem.strength` when set. Configurable: `GravitySystem.strength`, `GravitySystem.direction`. |
| `MovementSystem` | `scripts/MovementSystem/MovementSystem.js` | Integrates `Velocity` into `Position` each tick. |
| `CollisionSystem` | `scripts/CollisionSystem/CollisionSystem.js` | O(n²) AABB test. `col.hits` filled each tick for every overlap. Solid pairs get an MTV push: split 50/50 between two dynamic bodies, or applied fully to the dynamic one when its partner is `kinematic`; two kinematic bodies are not resolved. Requires `Collision`, `Position`, `BBox`. Tag mask filtering via `col.mask` (null = accept all). |
| `GroundedSystem` | `scripts/GroundedSystem/GroundedSystem.js` | Vertical platformer resolution: snaps movers (entities with `Grounded`, `Position`, `BBox`, `Velocity`) onto `kinematic` solids below/above, zeroes `vel.y`, and sets `gr.isGrounded`. The `Grounded` component (`{ isGrounded }`) lives in `scripts/Grounded/Grounded.js`. |
| `StateSystem` | `scripts/StateSystem/StateSystem.js` | Runs state machine transitions. `StateSystem.change(world, id, schema, force?)` queues a transition; `StateSystem.update(world)` processes it. `StateSchema = { enter?, update?, finish? }`. |
| `LifetimeSystem` | `scripts/LifetimeSystem/LifetimeSystem.js` | Decrements `lt.ticks` each tick; calls `world.remove(id)` when `≤ 0`. |
| `PathfindingSystem` | `scripts/PathfindingSystem/PathfindingSystem.js` | `setGrid(grid)`, `update(world)`, `invalidate(world)`, `current(world, id)`, `advance(world, id)`. See Pathfinding Flow below. |

### Pathfinding Flow

1. `world.add(id, PathRequest, { startX, startY, goalX, goalY })` — request in grid coords
2. `PathfindingSystem.update(world)` resolves → writes `PathResponse: { path, index }` where `index` is the cursor position
3. Read current waypoint: `PathfindingSystem.current(world, id)` → `{x, y}` or `undefined`
4. Advance on arrival: `PathfindingSystem.advance(world, id)` → `true` if more waypoints remain, `false` and detaches `PathResponse` when complete
5. After any grid change: `PathfindingSystem.invalidate(world)` — detaches all `PathResponse` components

### Level & Map Layers

`Level` (`scripts/Level/Level.js`) manages the tile grid and pathfinding grid. It is **separate from `World`** (the ECS).

```js
const LEVEL = new Level({ cellWidth: 32, cellHeight: 32 }); // cols/rows derived from room size
const terrain = new TileLayer(LEVEL.cols, LEVEL.rows, { emptyCost: Infinity }); // blocking base
LEVEL.insert(terrain);      // append a LevelLayer (LEVEL.remove(layer) to detach)
PathfindingSystem.setGrid(LEVEL.mpg); // wire up after layers are ready
LEVEL.syncAll();            // recompute all pathfinding costs
LEVEL.syncAt(x, y);         // recompute one cell
PathfindingSystem.invalidate(world); // call separately after any grid change
LEVEL.worldToGrid(wx, wy);  // → { x, y }
LEVEL.gridToWorld(gx, gy);  // → { x, y } (cell center)
```

**`LevelLayer` interface**: `get(x,y)`, `set(x,y,v)`, `getNavData(x,y) → { cost }`, `export()`, `import()`, `destroy()`. The single built-in implementation is **`TileLayer`** (`scripts/TileLayer/TileLayer.js`), which wraps a `Grid` of **`TileType`** values. Layers added later have higher nav-cost priority. Empty cells report the layer's `emptyCost` (constructor option): `undefined` (default) passes through to lower layers, and `Infinity` makes a blocking base layer. `TileType` (`scripts/TileType/TileType.js`) holds `{ id, name, pathCost }` (`pathCost: null` → `Infinity`, default `1`).

> The former `Floor`/`Terrain`/`Structure` layers and their `FloorType`/`TerrainType`/`StructureType` value classes are consolidated into `TileLayer`/`TileType`.

### Renderer

`Renderer` (`scripts/Renderer/Renderer.js`): ordered list of `RenderPass` objects. `insert(pass, index?)` / `remove(pass)` manage the list; `draw(world)` runs every pass; `destroy()` tears them down. Each pass receives `world` so it can query entities:

```js
// RenderPass interface
{ draw(world) { ... }, destroy() { ... } }

// Usage — each scene owns its renderer
this.renderer.draw(this.world);   // in scene's draw()
```

Built-in render passes:
- **`RenderEntity`** — draws entities with `Visual` + `Position` via `draw_sprite_ext`.
- **`RenderTileMap`** (`new RenderTileMap(layer, level, sprite, opt?)`) — hardware-accelerated tile rendering via `VertexBuffer`. `opt`: `{ autotile: 0|16|47, alpha, color, softEdge }`. Call `.markDirty()` after tile changes to trigger a VBO rebuild. Autotile modes: `0` = raw frame id, `16` = blob4 (4-bit neighbor mask), `47` = blob8 (47 normalized bitmasks).
- **`RenderDebugEntity`** — draws `BBox` outlines (lime) and `Name` labels (white) for all entities with `Position`. For debug use.
- **`RenderDebugPath`** (`new RenderDebugPath(level)`) — draws active `PathResponse` paths (yellow) and pending `PathRequest` goals (red cross). For debug use.
- **`RenderDebugTileMap`** (`new RenderDebugTileMap(level, opt?)`) — debug overlay: cost shading (red=blocked, orange=costly), grid lines, tile id/name labels, coordinate labels. `opt`: `{ grid, cost, tiles, coords, names, color, alpha, font }`. Call `level.syncAll()` first so cost data is populated.

**`VertexBuffer`** (`scripts/VertexBuffer/VertexBuffer.js`) — thin wrapper around GameMaker vertex buffers using a fixed `position + texcoord + colour` format. Methods: `.begin()`, `.addQuad(x,y,w,h,u0,v0,u1,v1,color?,alpha?)`, `.addQuadV(...)` (per-corner alpha), `.end(freeze?)`, `.submit(texture)`, `.destroy()`.

### UI System

- **`UIElement`** (`scripts/UIElement/UIElement.js`): Tree node backed by `flexpanel` (GameMaker's built-in Flexbox). `insertChild`, `removeChild`, `addComponent(c)`, `getComponent(Class)`, `getComponents(Class)`, `removeComponent(c)`. `markDirty()` propagates to root; `refresh()` calls `flexpanel_calculate_layout`.
- **`UI`** (`scripts/UI/UI.js`): Static root registry. `UI.insert(root, index?, enabled?)`, `UI.remove(root)`, `UI.setEnabled(root, bool)`. `update()` traverses in reverse (highest index blocks lower); `draw()` traverses forward.
- **`UIComponent` interface**: `{ onUpdate?(element, block), onDraw?(element), onDestroy?(element) }`. Built-ins: `UIButton`, `UIText`, `UIImage`, `UIPanel`, `UITrigger`, `UISlider`, `UISelect`, `UIInput`, `UITooltip`.
- **`Tooltip`**: Standalone static class, not a `UIComponent`. `Tooltip.set(str)` from anywhere; renders once per frame at mouse position. `Tooltip.draw()` in `Draw_75`.
- **Commented-out `UIElement` methods**: Many `flexpanel_node_style_*` calls are commented out pending GameMaker bug [#15065](https://github.com/YoYoGames/GameMaker-Bugs/issues/15065). Do not uncomment until resolved.

### Input System

- **`Input`** / **`InputAction`**: `Input.register(key, action)`, `Input.get(key)` → `InputAction`. Query: `.down()`, `.pressed()`, `.released()`, `.value()`. Bind: `.bindButton(source, button)` / `.bindAxis(mode, axis)`.

### `EntityPreset`

`EntityPreset` (`scripts/EntityPreset/EntityPreset.js`) is a factory for spawning entities from named presets:

```js
EntityPreset.register([
  { id: "enemy", components: { Velocity: { x: 0, y: 0, z: 0 }, Lifetime: { ticks: 120 } } }
]);

const id = EntityPreset.spawn("enemy", world, x, y, z);

EntityPreset.has("enemy");   // → boolean
EntityPreset.get("enemy");   // → preset object or undefined
```

### `Query` — Spatial Entity Lookup

`Query` (`scripts/Query/Query.js`) provides spatial searches over entities with `Position`:

```js
Query.nearest(world, x, y, opts)           // → id or -1
Query.farthest(world, x, y, opts)          // → id or -1
Query.inRect(world, x1, y1, x2, y2, opts)  // → id[]
Query.inRadius(world, x, y, radius, opts)  // → id[]
```

**`opts`**: `{ tag?: string, maxDist?: number, hasCollision?: boolean }`. `tag` filters by `Tag` component (`{ tags: Set }`).

### Utility Modules

- **`Settings`**: Persists to `settings.json` (`Settings.PATH`). Call `Settings.registerDefaults({ key: value, ... })` before `Settings.load()` at startup. `Settings.get(key)` falls back to defaults; `Settings.set(key, val)` updates in memory; `Settings.save()` writes to disk (only keys present in `defaults`). Multiple `registerDefaults()` calls merge additively.
- **`Color`**: `Color.rgb(r,g,b)`, `Color.hsv(h,s,v)`, `Color.merge(c1,c2,t)`, `Color.parse("#rrggbb")` — all return GameMaker color integers. `Color.alpha(color)` extracts the alpha byte `[0,1]`.
- **`I18n`**: `I18n.load(manifestPath)` reads a `manifest.json` that lists text-file masks (e.g. `text/*.json`), fonts, images, and sounds; text files are flat `{ key: value }` JSON merged into `I18n.texts`. Access strings with `I18n.text(key, ...params)` or `I18n.textRef(key, ...params)` (returns a `() => string` for live-updating UI labels); fonts via `I18n.font(key)`. Ships `ko-KR` (Noto Sans KR, SIL OFL 1.1) with UI strings in `datafiles/i18n/ko-KR/text/ui.json`.
- **`Camera`** / **`cameraFollow`** / **`cameraFollow2d`**: `Camera` wraps `camera_*` handle; supports ORTHO, PERSPECTIVE, PERSPECTIVE_FOV projections. `cameraFollow({ world, followTarget, followLerp?, followHeight?, ... })` — 3D perspective follow. `cameraFollow2d({ world, followTarget, followLerp?, width?, height?, ... })` — 2D orthographic follow (pixel-snapped). Both require a `world` reference to read the target's `Position`. Call `.update()` each step and `.assign(viewIndex)` to attach to a viewport.
- **`MotionPlanner`**: Static A* on `MotionPlanningGrid`. `MotionPlanner.plan(start, goal, algorithm?, opt?)` → `{x,y}[]`. Options: `allowDiag`, `cornerCutting`, `heuristicWeight`, `maxIter`.
- **`File`**: Sync file I/O. `File.find(mask)` → `string[]`, `File.read(fname)` → `string|undefined`, `File.write(fname, data)` → `boolean`.
- **Global utils** (`scripts/utils/utils.js`): `noop()`, `uuid()` → UUID v4 string, `rem(value)` → pixel size relative to current font size.
