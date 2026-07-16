# G.E.M.S. Architecture — Level & Map Layers (Tiles & Zones)

Area reference split out of the always-loaded core ([ARCHITECTURE.md](../ARCHITECTURE.md)). Loaded on demand: **Read this file before designing or modifying anything in this area.** Runtime quirks live in [GMRT.md](../GMRT.md).

## Level & Map Layers

`LevelGrid` manages the tile grid + zone channels, **separate from the ECS store** (scenes hold one as `.level`). It carries **no pathfinding grid** — live nav is `NavGrid` (colliders + streamed-terrain costs, ecs.md → Pathfinding); the layers' `costAt(x, y)` (topmost layer wins) exists for debug inspection only. `worldToGrid`/`gridToWorld` convert coords (`gridToWorld` returns the cell **center**).

**`LevelLayer` interface**: `get`/`set`, `getNavData(x,y) → { cost }`, `export`/`import`/`destroy`. The one built-in is **`TileLayer`**, wrapping a `Grid` of **`TileType`** values (`{ id, name, pathCost }`; `pathCost: null` → `Infinity`, default `1`). Later-added layers have higher priority in `costAt`; an empty cell reports the layer's `emptyCost` — `undefined` (default) passes through to lower layers, `Infinity` makes a blocking base.

**`TileEdit`** (Core) is the genre-agnostic tile-editing service that keeps a solid layer's **colliders** in sync with edits, so the "edit a solid tile → rebuild colliders" invariant lives in one place (there is no nav resync — live pathfinding reads `NavGrid`, and the colliders it meshes ARE how a wall reaches nav). `occupied(layer,gx,gy)` is a truthy read (`Grid.get` returns `0`, not `undefined`, for an empty in-bounds cell); `set`/`clear` edit; `meshSolid(world,level,layer,out)` greedy-meshes the solid cells into the fewest kinematic-solid colliders (extend right for width, then down while the whole row is solid) — so straight walls become single seamless colliders, avoiding the per-cell-seam snag bug; `remesh(world,level,layer,colliders)` removes the old set and re-meshes after a solid-tile edit. Shared by `RpgLevel.build` (initial mesh) and `BuildMode` (per-edit).

### Zones

**`Zone`** / **`ZoneMap`** / **`ZoneSystem`** add named, tagged spatial regions on top of the level grid — the substrate for buildable area, faction territory, events, quest regions, weather areas. (Separate from tile layers and from nav cost; a zone is metadata, not a tile.)

- **`Zone`** — a flat definition `{ id, name, tags, data }`. `tags` is a **`string[]`**, never a `Set` (Set iteration crashes GMRT); `data` is a flat scalar payload to stay JSON-safe.
- **`ZoneMap`** — one zone **channel**: a `Grid` of zone-id ints (`0` = none) plus a registry of `Zone`s, exactly as `TileLayer` wraps `Grid<TileType>`. **A cell belongs to at most one zone within a map** — lookup is O(1), storage one int per cell; purposes that can overlap (faction vs. weather vs. event) live in **separate maps**. `define(opt)` auto-assigns the id; paint/erase by cell or rect; look up by cell (`idAt`/`at`/`contains`) or zone (`cells`).
- **`ZoneSystem`** — the entity↔zone glue, stateless with named methods (no World tick): `update(world, level, map, { tag?, onEnter?, onExit? })` fires enter/exit edges as entities cross borders (mark-and-sweep over `map._inside`, so leaving to an empty cell _or_ being removed both fire `onExit`); `zoneOf`/`entitiesIn` query. Drive `update` from a scene's `step()`.

Zones live on the **`Level`** (they are level data): `level.addZoneMap(key, map?)` (sized to the grid by default), `level.zoneMap(key)`, `level.zoneAt(key, wx, wy)`. `Level.export`/`import` round-trip zone maps under a `zoneMaps` key, emitted only when non-empty so existing serialized levels are unaffected; `Level.destroy` tears them down. Visualization is a `RenderZone` (+ `RenderZoneLabel`) pass per channel (renderer.md).

Two channels exist: **`"settlement"`** (the Gameplay `Settlement` module — gameplay.md; gating/usage in rpg.md → BuildMode) and **`"climate"`** (rpg.md → Climate zones). Both are authorable from a level file's meta and painted by `RpgMap.build`: `meta.settlements` is `[{ id, name, faction?, comp?, rect: [gx1,gy1,gx2,gy2], color? }]` — `id` the stable sid, `name` an **i18n key** (the label renders in-world), `comp` a comma-joined `SettlementComponent` id list — mirroring `meta.climate`.
