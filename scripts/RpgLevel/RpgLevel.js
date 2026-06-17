// Level builder for the top-down demo. Reads level data produced by
// LevelSerializer.load (genre "topdown"); add more level files to extend the game.
//
// build() creates the resident tile layers from RpgLevel.LAYERS (terrain/floor/wall/fence,
// bottom→top — see LAYERS) and returns { level, spawn, colliders, plus <key>Layer + <key>Type
// per layer } — the scene owns level's lifecycle. The layers stay on the level so the
// RenderTileMap passes (built in RpgMap from LAYERS) draw them and build mode can edit them;
// wall colliders are greedy-meshed by the Core TileEdit service (TileEdit.meshSolid here,
// TileEdit.remesh after build-mode edits).
//
// Level data: { cell?, cols, rows, meta: { playerSpawn: { gx, gy } },
//   walls: [[x, y, w, h], ...] } — walls are authored as cell rectangles (compact +
// hand-authorable, and they map straight onto the greedy mesh below). Grid size comes
// from cols/rows, NOT the room, so a level can exceed the view and the follow camera
// scrolls across it.

const RPG_CELL = 32; // fallback cell size when a level omits `cell`

globalThis.RpgLevel = {
  // World graph: map id -> level file. The overworld hub, sub-levels (interiors/dungeons),
  // and side-islands are all just map files connected by `portal` spawns (see RpgSpawn.spawn).
  // This is the seed registry — extract to a `maps.json` manifest later if it grows. START is
  // the map a normal lobby launch boots into; RpgMap.load(id, entry) resolves files here.
  MAPS: {
    overworld: "levels/overworld.json",
    interior_01: "levels/interior_01.json",
  },
  START: "overworld",
  mapFile(id) {
    return RpgLevel.MAPS[id];
  },

  // Set by the level editor's Test Play to a save-dir level file; sceneRpg consumes it
  // once on create (then clears it, falling back to the bundled level). Not gameplay state —
  // a one-shot hand-off channel between the editor and the play scene.
  playtestFile: undefined,

  // Resident-grid tile layers, drawn bottom→top — one render-distinct material each.
  // RenderTileMap autotiles by OCCUPANCY (not tile-type identity), so two materials with
  // different autotile modes (wall=blob47, fence=blob16) can't share a TileLayer; each gets its
  // own layer + RenderTileMap pass (created in RpgMap from this table). Swap `type`/`sprite`/
  // `color` to re-skin a layer. `type`: "dual" corner-grid, 0 raw single-frame, 16 blob4, 47
  // blob8. `id` is the TileType identity; for a SINGLE-sprite layer (type 0) RenderTileMap uses
  // TileType.id as the frame index, so `floor.id` MUST be a real frame (0 = spr_square's only
  // frame). `pathCost: null` → Infinity (blocking); `solid` layers are greedy-meshed into
  // kinematic colliders. `fill` auto-fills the whole grid (the walkable terrain base) on plain
  // maps; chunked maps build these EMPTY (player builds only). Order = nav priority (top wins).
  LAYERS: [
    {
      key: "terrain",
      id: 1,
      name: "지형",
      type: "dual",
      sprite: "spr_tiledual",
      color: "#5d8a46",
      solid: false,
      pathCost: 1,
      emptyCost: 1,
      fill: true,
    },
    {
      key: "floor",
      id: 0,
      name: "바닥",
      type: 0,
      sprite: "spr_square",
      color: "#b0936a",
      solid: false,
      pathCost: 1,
    },
    {
      key: "wall",
      id: 1,
      name: "벽",
      type: 47,
      sprite: "spr_tile47",
      color: "#707888",
      solid: true,
      pathCost: null,
    },
    {
      key: "fence",
      id: 1,
      name: "울타리",
      type: 16,
      sprite: "spr_tile16",
      color: "#8a6d3b",
      solid: true,
      pathCost: null,
    },
  ],

  // Create the LAYERS TileLayers + TileTypes, insert them on the level bottom→top, and return a
  // handles bag keyed `<key>Layer` / `<key>Type`. Shared by build() + buildChunked(); the caller
  // does the painting/fill/colliders. The legacy wallLayer/floorLayer/wallType/floorType names
  // BuildMode + sceneEditor read fall out of this for free (keys "wall"/"floor").
  _makeLayers(level) {
    const h = {};
    for (let i = 0; i < RpgLevel.LAYERS.length; i++) {
      const cfg = RpgLevel.LAYERS[i];
      const layer = new TileLayer(level.cols, level.rows, {
        emptyCost: cfg.emptyCost,
      });
      level.insert(layer);
      h[cfg.key + "Layer"] = layer;
      h[cfg.key + "Type"] = new TileType({
        id: cfg.id,
        name: cfg.name,
        pathCost: cfg.pathCost,
      });
    }
    return h;
  },

  // Auto-fill each `fill` layer's whole grid with its material (the walkable terrain base).
  // Plain maps only — chunked maps leave the resident grid empty (ChunkManager owns terrain).
  _fillLayers(level, h) {
    for (let i = 0; i < RpgLevel.LAYERS.length; i++) {
      const cfg = RpgLevel.LAYERS[i];
      if (!cfg.fill) continue;
      const layer = h[cfg.key + "Layer"];
      const type = h[cfg.key + "Type"];
      for (let y = 0; y < level.rows; y++)
        for (let x = 0; x < level.cols; x++) layer.set(x, y, type);
    }
  },

  // Paint cell-rectangles ([x, y, w, h]) of `type` into a layer. Shared by the wall/floor
  // file-rect painting; an absent array is a no-op, so older level files are unaffected.
  _paintRects(layer, rects, type) {
    if (rects === undefined) return;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      for (let y = r[1]; y < r[1] + r[3]; y++)
        for (let x = r[0]; x < r[0] + r[2]; x++) layer.set(x, y, type);
    }
  },

  /**
   * Creates a Level from data, paints walls into a persistent TileLayer, and spawns
   * kinematic wall colliders into world. Returns the level handles; the caller owns
   * level.destroy() and the collider entities.
   *
   * `entryId` selects where the player spawns from `meta.entries` (a named-point map, e.g.
   * "default" or "from_interior" — the matching side of a portal). Falls back to
   * entries.default, then to the legacy `meta.playerSpawn`, so older single-entry files
   * still build unchanged.
   */
  build(world, data, entryId = "default") {
    const cell = data.cell ?? RPG_CELL;
    const level = new Level({
      cellWidth: cell,
      cellHeight: cell,
      cols: data.cols,
      rows: data.rows,
    });
    // Resident tile layers (terrain/floor/wall/fence) from LAYERS, bottom→top. Terrain is
    // auto-filled as the walkable base so the ground renders immediately; walls + optional
    // floors come from the file's cell-rects. Fence has no file source yet (stays empty).
    // Level._computeNav resolves a wall cell → Infinity, else falls through to the terrain
    // base → 1 (top-priority layer with data wins).
    const h = RpgLevel._makeLayers(level);
    RpgLevel._fillLayers(level, h);
    RpgLevel._paintRects(h.wallLayer, data.walls, h.wallType);
    RpgLevel._paintRects(h.floorLayer, data.floors, h.floorType);
    level.syncAll();

    const colliders = [];
    TileEdit.meshSolid(world, level, h.wallLayer, colliders);

    const spawn = this._resolveSpawn(level, data, entryId);
    return { level, spawn, colliders, ...h };
  },

  /**
   * Build a Level for a CHUNK-STREAMED map: a large resident grid whose wall/floor TileLayers
   * are left EMPTY (reserved for the player's own builds — build mode). The streamed terrain
   * (authored hub + procedural wilderness) is owned by the ChunkManager, not this grid, so
   * nothing is painted and no colliders are meshed here (returns `colliders: []`). Grid size
   * comes from meta.worldCols/worldRows (the build-allowed home region); the world extends
   * infinitely beyond it via chunks. Same return shape + layer order as build() so the scene
   * code and Level.import (the _mapCache round-trip for player builds) are unchanged.
   */
  buildChunked(world, data, entryId = "default") {
    const cell = data.cell ?? RPG_CELL;
    const cols = data.meta.worldCols ?? data.cols ?? 128;
    const rows = data.meta.worldRows ?? data.rows ?? 128;
    const level = new Level({
      cellWidth: cell,
      cellHeight: cell,
      cols,
      rows,
    });
    // Resident grid stays EMPTY (player builds only) — the streamed terrain + its colliders are
    // the ChunkManager's. Same layer set/order as build() so Level.import (the _mapCache
    // round-trip for player builds) matches; no fill, no colliders.
    const h = RpgLevel._makeLayers(level);
    level.syncAll();

    const spawn = this._resolveSpawn(level, data, entryId);
    return { level, spawn, colliders: [], ...h };
  },

  /**
   * Wall border ringing a finite chunked world (worldCols × worldRows cells, anchored at cell 0)
   * so the player + slimes can't leave the bounded overworld. The 4 colliders are ALWAYS present
   * (not chunk-managed — like the party), kinematic-solid like any wall, so SolidSystem collides
   * against them and NavGrid rasterizes them (pathfinding respects the edge for free). Same
   * Position(top-left)+BBox(0,0,w,h)+kinematic-solid shape as ChunkManager._meshWalls. Returns the
   * ids (freed by world.destroy() on a map swap). Top/bottom span the full width; left/right span
   * one cell past each so the outer corners are covered (no diagonal slip-through).
   */
  buildWorldBorder(world, level, worldCols, worldRows) {
    const cw = level.cellWidth;
    const ch = level.cellHeight;
    const W = worldCols * cw;
    const H = worldRows * ch;
    const rects = [
      [0, -ch, W, ch], // top
      [0, H, W, ch], // bottom
      [-cw, -ch, cw, H + 2 * ch], // left (covers outer corners)
      [W, -ch, cw, H + 2 * ch], // right (covers outer corners)
    ];
    const ids = [];
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const id = world.create();
      world.add(id, Position, { x: r[0], y: r[1], z: 0 });
      world.add(id, BBox, { x: 0, y: 0, width: r[2], height: r[3] });
      world.add(id, Collision, {
        solid: true,
        kinematic: true,
        mask: null,
        hits: [],
      });
      ids.push(id);
    }
    return ids;
  },

  // Resolve the player spawn point (world coords): named entry → entries.default → legacy
  // meta.playerSpawn. Shared by build() and buildChunked().
  _resolveSpawn(level, data, entryId) {
    const entries = data.meta.entries;
    let entry = data.meta.playerSpawn;
    if (entries !== undefined)
      entry = entries[entryId] ?? entries.default ?? entry;
    return level.gridToWorld(entry.gx, entry.gy);
  },
};
