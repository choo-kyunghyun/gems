# G.E.M.S. Architecture — ECS Core & Simulation

Area reference split out of the always-loaded core ([ARCHITECTURE.md](../ARCHITECTURE.md) — the layer map, cross-cutting invariants, and reference index). Loaded on demand: **Read this file before designing or modifying anything in this area.** Cross-references to sections of other areas resolve via the core index; runtime quirks live in [GMRT.md](../GMRT.md).

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
world.componentsOf(id); // { token: data } of every component this entity has
```

## `EntitySnapshot`

`EntitySnapshot` (`scripts/EntitySnapshot/`, Core) is the single-entity serialize/migrate primitive — the counterpart to `World.export` for one entity. `capture(world, id, components?)` → `{ components: { token: data } }` (a component-token subset, or all via `world.componentsOf`); `apply(world, id, snapshot)` adds those components onto an **existing** entity; `restore(world, snapshot, overrides?)` `world.create`s a fresh entity, applies the snapshot, then applies `overrides` (e.g. a new `Position`/zeroed `Velocity`). Data objects are **referenced, not deep-copied** — a captured component re-attaches by reference; when a source world is freed (chunk un/load) the objects survive its `world.destroy()` since only the storage map is dropped. It's the substrate for migrating an entity between Worlds — `World.levels.take`/`put`/`transfer` wrap it, and the RPG **squad** crosses a portal as whole-entity take/put (see `RpgMap.go`) — and the seed for disk saves + chunk streaming (a chunk un/load is the same capture/restore over a region's entities). Serialize the record yourself for disk (mind the `JSON` nested-value fault + `Set` fields).

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

Genre scenes compose these into a **`Pipeline`** (`scripts/Pipeline/`): `this.physics = new Pipeline().add(SystemA).add(stepFn)`, then `this.physics.update(world)` each tick. A step is any `{ update(world) }` object or a bare function. Per genre: platformer `Gravity → clampFall → SolidSystem`; top-down/RPG `SolidSystem → SeparationSystem → ProjectileSystem` (separation unstacks crowding slimes/followers, equal-mass push-apart).

**Motion integrators are exclusive per body**: `MovementSystem` integrates _free_ movers (no collision response), `SolidSystem` is move-and-collide for solid bodies, `ProjectileSystem` is move-and-raycast for projectiles. A given mover is integrated by exactly one of them.

**`Time`** (`scripts/Time/Time.js`): `Time.delta` (scaled seconds), `Time.raw` (wall-clock), `Time.scale` (time dilation). Updated by `obj_game` in `Step_0` before `scene.step()` — always available in scene code. The clock split (UI timers/easing on `Time.raw`, world/gameplay on `Time.delta`) is a cross-cutting invariant — the full rule lives in the core ([ARCHITECTURE.md](../ARCHITECTURE.md) → _Cross-Cutting Invariants_).

## Built-in Systems

| System                | File                           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GravitySystem`       | `scripts/GravitySystem/`       | Applies `strength * direction * tickDuration` to entities with `Velocity`. `world.gravity` overrides `GravitySystem.strength`. Configurable: `.strength`, `.direction`.                                                                                                                                                                                                                                                                                 |
| `MovementSystem`      | `scripts/MovementSystem/`      | Integrates `Velocity` into `Position` each tick. For _free_ movers with no collision response; solid bodies are integrated by `SolidSystem` instead.                                                                                                                                                                                                                                                                                                    |
| `SolidSystem`         | `scripts/SolidSystem/`         | Discrete "move-and-collide" for dynamic solid bodies vs `kinematic` solids. Integrates each body's `Velocity` itself, sub-stepped (`SolidSystem.maxStep`, default 8) so fast movers can't tunnel, resolving per axis (wall-slide for free). Sets `Grounded.isGrounded` when a body is pushed up out of a downward move. Requires `Collision` (solid, non-kinematic), `Position`, `BBox`, `Velocity`. `Grounded = { isGrounded }` (`scripts/Grounded/`). |
| `SeparationSystem`    | `scripts/SeparationSystem/`    | Equal-mass MTV push-apart between dynamic solid bodies (unit crowding). `SeparationSystem.iterations` passes per tick so dense clusters settle. Pure resolution — run after `SolidSystem`. Uses `world.broadphase` if set (see `Broadphase`); otherwise O(n²) per iteration.                                                                                                                                                                            |
| `TriggerSystem`       | `scripts/TriggerSystem/`       | Overlap detection → fills/clears `col.hits` for game logic (sensors, pickups). Detection only; records pairs where at least one side is non-solid. Owns `col.hits`. Uses `world.broadphase` if set (see `Broadphase`); otherwise O(n²).                                                                                                                                                                                                                 |
| `StateSystem`         | `scripts/StateSystem/`         | State machine over a **named pool**: `register([{ id, enter?, update?, finish? }])` (callbacks receive `(world, id)`; re-register replaces), `get(id)` (throws on unknown — fail fast). `State.current/next` hold the id **strings** (`""` = none), so a captured/parked actor round-trips its state as plain data. `StateSystem.change(world, id, name, force?)` queues; `update(world)` resolves + processes.                                         |
| `LifetimeSystem`      | `scripts/LifetimeSystem/`      | Decrements `lt.ticks` each tick; `world.remove(id)` when `≤ 0`.                                                                                                                                                                                                                                                                                                                                                                                         |
| `InterpolationSystem` | `scripts/InterpolationSystem/` | Render-interpolation bookkeeping. `snapshot(world)` records each mover's `Position` into `PrevPosition` (`scripts/PrevPosition/`) — call at the **top of each tick**, before any system moves `Position`. Renderers then draw at `PrevPosition + (Position − PrevPosition) * world.alpha` to keep fixed-step motion smooth when display refresh ≠ tickrate. Tracks `Velocity` movers only; static bodies fall back to `Position`.                       |
| `PathfindingSystem`   | `scripts/PathfindingSystem/`   | `update`, `invalidate`, `current(world, id)`, `advance(world, id)`; the grid is wired via `MotionPlanner.setGrid` (RpgMap points it at the per-map `NavGrid` once per map). See Pathfinding Flow.                                                                                                                                                                                                                                                       |

## Pathfinding Flow

1. `world.add(id, PathRequest, { startX, startY, goalX, goalY })` — request in grid coords.
2. `PathfindingSystem.update(world)` resolves → writes `PathResponse: { path, index }` (`index` = cursor).
3. `PathfindingSystem.current(world, id)` → current waypoint `{x, y}` or `undefined`.
4. `PathfindingSystem.advance(world, id)` → `true` if more waypoints remain; `false` (and detaches `PathResponse`) when complete.
5. After any grid change: `PathfindingSystem.invalidate(world)` — detaches all `PathResponse`.

**Path consumption (`PathFollow`).** **`PathFollow`** (`scripts/PathFollow/`, Core) is the consumer side of the flow — extracted from `CombatAI` so any steering system shares one path walker and one terrain-cost rule. `target(world, level, id, state, sp, tx, ty)` returns the mover's proper **movement point** this tick: it replans on `state`'s `pathCd`/`pathRate` throttle (any bag carrying those fields — `CombatAI`'s `Brain`), advances the waypoint cursor on arrival (within 0.4 cell), and falls back to `(tx, ty)` while no `PathResponse` exists (the request resolves later the same tick). `clear(world, id)` drops both path components (LOS cleared / leaving the behavior). It also owns **terrain movement-point pricing**: an injected per-map `costProvider` (`bind(fn)`, rebound each map activate like `CombatAI.bind`, `(wx, wy) → cost`) feeds `costAt`/`speedScale` — a mover multiplies its speed by `1/cost` at its feet (clamped at `maxCost` 4 so a blocked sliver can't strand it). Consumers: `CombatAI._seek`, `FollowerSystem`, `PlayerSystem` (the player wades/slogs like everyone).

**Pathfinding grid (`NavGrid`) — the ONE live nav source.** `MotionPlanner` plans over one `MotionPlanningGrid`; the obstacles aren't tile data — terrain/walls/border exist as kinematic-solid collider _entities_ (owned by `ChunkManager` on the chunked overworld, where the world is large and only nearby chunks are loaded). **`NavGrid`** (`scripts/NavGrid/`, Core) is the adapter: a small fixed window (default 32×32) re-centered on the player each frame (`rebuild(world, gx, gy)` from `sceneRpg.step`, before the tick loop) by rasterizing every kinematic-solid collider's `AABB.of` footprint into blocked cells **over a terrain-cost base** — an optional constructor `costAt(wx, wy)` sampler (the same provider `PathFollow` binds; `RpgMap._terrainCost` wires `chunks.costAt`) fills each cell with its weighted movement cost (cached per window, resampled only when the origin moves), which `MotionPlanner` multiplies into step distance — so A* prefers cheap ground and only wades water when it beats walking around. Exposes the `MotionPlanningGrid` interface in **absolute level-cell coords** so paths return level cells. `size()` is constant, so `MotionPlanner.setGrid(scene.nav)` is called **once per map**; only occupancy/origin change per frame. One cheap grid unifies streamed terrain + border + player builds + interior walls. The consumer is **`CombatAI.CHASE`**: line-of-sight-first — a clear shot (`Raycast`) is a straight seek; only a wall triggers a throttled `PathRequest` → `PathfindingSystem` → `PathResponse`, walked via `PathFollow.target`. `RpgMap` inserts a default-off `RenderDebugPath` pass for the Debug **paths** toggle.
