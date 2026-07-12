# G.E.M.S. Architecture — Level & Map Layers (Tiles & Zones)

Area reference split out of the always-loaded core ([ARCHITECTURE.md](../ARCHITECTURE.md) — the layer map, cross-cutting invariants, and reference index). Loaded on demand: **Read this file before designing or modifying anything in this area.** Cross-references to sections of other areas resolve via the core index; runtime quirks live in [GMRT.md](../GMRT.md).

## Level & Map Layers

`LevelGrid` (`scripts/LevelGrid/`) manages the tile grid + zone channels, **separate from the ECS store** (scenes hold one as `.level`). It carries **no pathfinding grid** — live nav is `NavGrid` (colliders + streamed-terrain costs, see Pathfinding Flow); the layers' tile costs are read on demand via `costAt` only for debug inspection.

```js
const grid = new LevelGrid({ cellWidth: 32, cellHeight: 32 }); // cols/rows derived from room size
const terrain = new TileLayer(grid.cols, grid.rows, { emptyCost: Infinity }); // blocking base
grid.insert(terrain); // append a LevelLayer (grid.remove to detach)
grid.costAt(x, y); // on-demand tile cost — topmost layer wins (debug shading; NOT live nav)
grid.worldToGrid(wx, wy);
grid.gridToWorld(gx, gy); // ↔ { x, y } (gridToWorld returns cell center)
```

**`LevelLayer` interface**: `get(x,y)`, `set(x,y,v)`, `getNavData(x,y) → { cost }`, `export()`, `import()`, `destroy()`. The one built-in is **`TileLayer`** (`scripts/TileLayer/`), wrapping a `Grid` of **`TileType`** values. Later-added layers have higher cost priority in `costAt`. Empty cells report the layer's `emptyCost`: `undefined` (default) passes through to lower layers; `Infinity` makes a blocking base. `TileType` (`scripts/TileType/`) holds `{ id, name, pathCost }` (`pathCost: null` → `Infinity`, default `1`).

**`TileEdit`** (`scripts/TileEdit/`, Core) is the genre-agnostic tile-editing service that keeps a solid layer's **colliders** in sync with edits, so the "edit a solid tile → rebuild colliders" invariant lives in one place (there is no nav resync — live pathfinding reads `NavGrid`, and the colliders it meshes ARE how a wall reaches nav). `occupied(layer,gx,gy)` (truthy read — `Grid.get` returns `0`, not `undefined`, for an empty in-bounds cell), `set(layer,gx,gy,type)` / `clear(layer,gx,gy)`, `meshSolid(world,level,layer,out)` (greedy-mesh the solid cells into the fewest kinematic-solid colliders — extend right for width, then down while the whole row is solid — so straight walls become single seamless colliders, avoiding the per-cell-seam snag bug; box size = `level.cellWidth/Height`, ids pushed onto `out`), and `remesh(world,level,layer,colliders)` (remove old + re-`meshSolid` after a solid-tile edit). Shared by `RpgLevel.build` (initial mesh) and `BuildMode` (per-edit set/clear/remesh); the seed for a future in-engine tile editor.

### Zones

**`Zone`** / **`ZoneMap`** / **`ZoneSystem`** add named, tagged spatial regions on top of the level grid — the substrate for build-mode buildable area, faction territory, in-game events, quest regions, weather areas, etc. (Separate from tile layers and from nav cost; a zone is metadata, not a tile.)

- **`Zone`** (`scripts/Zone/`) — a flat definition object `{ id, name, tags, data }`. `tags` is a **`string[]`** (`hasTag(t)` via `indexOf`), never a `Set` (Set iteration crashes GMRT); `data` is a flat scalar payload (`{ factionId, weather, questId, color, … }`) to stay JSON-safe.
- **`ZoneMap`** (`scripts/ZoneMap/`) — one zone **channel**: a `Grid` of zone-id ints (`0` = none) plus a registry of `Zone`s, exactly as `TileLayer` wraps `Grid<TileType>`. A cell belongs to **at most one zone within a map**, so lookup is O(1) and storage is one int per cell; purposes that can overlap (faction vs. weather vs. event) live in **separate maps**. API: `define(opt) → Zone` (auto-assigns id), `zone(id)`, `byTag(tag)`, `paint(id,gx,gy)`/`paintRect(id,x1,y1,x2,y2)`, `erase`/`eraseRect`, `idAt(gx,gy)`, `at(gx,gy) → Zone`, `contains(gx,gy,tag)`, `cells(id) → {x,y}[]`, `export`/`import`/`destroy`.
- **`ZoneSystem`** (`scripts/ZoneSystem/`) — the entity↔zone glue, a stateless system object with named methods (no World tick): `update(world, level, map, { tag?, onEnter?, onExit? })` fires enter/exit edges as entities cross borders (mark-and-sweep over `map._inside`, so leaving to an empty cell _or_ being removed both fire `onExit`); `zoneOf(world, level, map, id) → Zone`; `entitiesIn(world, level, map, id, { tag? }) → id[]`. Drive `update` from a scene's `step()` for events/weather/quests.

Zones live on the **`Level`** (they are level data): `level.addZoneMap(key, map?)` (sized to the grid by default), `level.zoneMap(key)`, and `level.zoneAt(key, wx, wy) → Zone` (world-space convenience). `Level.export`/`import` round-trip zone maps under a `zoneMaps` key, emitted only when non-empty so existing serialized levels are unaffected; `Level.destroy` tears them down.

To **visualize** a channel, add a `RenderZone` pass (see Renderer) to the scene's renderer: `renderer.insert(new RenderZone(level, "faction"))`; for the zone names add a `RenderZoneLabel` pass after it: `renderer.insert(new RenderZoneLabel(level, "faction", { font }))`.

The reference consumers are the RPG scene's **settlements** (the Gameplay **`Settlement`** module over a `"settlement"` channel — each settlement is a `Zone` carrying `{ factionId, color }` + a name, its cells its lands): a Survey Post **founds** the player's settlement (`Settlement.found` → `paintRect`), `BuildMode` gates building to player-owned land, and a `RenderZone` + `RenderZoneLabel` pair draws every settlement's territory (per-zone color + centroid name). Non-player settlements are authorable from a level file's optional `meta.settlements` array (`[{ name, faction?, rect: [gx1,gy1,gx2,gy2], color? }]`, painted by `RpgMap.build` — mirrors `meta.climate`). The other channel is **`"climate"`** (see _Climate zones_ under Weather): regions that override the global `Weather` (forced condition + temperature offset) while the player is inside.
