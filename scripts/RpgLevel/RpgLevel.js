// Level builder for the top-down demo. Reads level data produced by
// LevelSerializer.load (genre "topdown"); add more level files to extend the game.
//
// build() creates and returns { level, spawn, wallLayer, floorLayer, wallType,
// floorType, colliders } — the scene owns level's lifecycle. The wall TileLayer is
// kept on the level (not discarded) so a debug render pass can draw it and build mode
// can edit it; colliders are greedy-meshed from that layer by the Core TileEdit service
// (TileEdit.meshSolid here, TileEdit.remesh after build-mode edits).
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
    const wallType = new TileType({ id: 1, name: "벽", pathCost: null });
    const floorType = new TileType({ id: 2, name: "바닥" }); // walkable cosmetic (pathCost 1)

    // Bottom floor layer (walkable, nav-neutral) then the wall layer above it. Both stay
    // on the level so Level._computeNav resolves wall→Infinity else floor/empty→1 and the
    // debug pass can read them. Floors are placed at runtime by build mode, so the file
    // paints only walls.
    const floorLayer = new TileLayer(level.cols, level.rows, { emptyCost: 1 });
    const wallLayer = new TileLayer(level.cols, level.rows);
    level.insert(floorLayer);
    level.insert(wallLayer);

    const rects = data.walls ?? [];
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const x0 = r[0];
      const y0 = r[1];
      for (let y = y0; y < y0 + r[3]; y++)
        for (let x = x0; x < x0 + r[2]; x++) wallLayer.set(x, y, wallType);
    }
    // Optional floor rects (walkable cosmetic, no collider) — same [x,y,w,h] shape as
    // walls; absent in older level files, so the game is unaffected when omitted.
    const frects = data.floors ?? [];
    for (let i = 0; i < frects.length; i++) {
      const r = frects[i];
      const x0 = r[0];
      const y0 = r[1];
      for (let y = y0; y < y0 + r[3]; y++)
        for (let x = x0; x < x0 + r[2]; x++) floorLayer.set(x, y, floorType);
    }
    level.syncAll();

    const colliders = [];
    TileEdit.meshSolid(world, level, wallLayer, colliders);

    const spawn = this._resolveSpawn(level, data, entryId);
    return {
      level,
      spawn,
      wallLayer,
      floorLayer,
      wallType,
      floorType,
      colliders,
    };
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
    const wallType = new TileType({ id: 1, name: "벽", pathCost: null });
    const floorType = new TileType({ id: 2, name: "바닥" });
    const floorLayer = new TileLayer(level.cols, level.rows, { emptyCost: 1 });
    const wallLayer = new TileLayer(level.cols, level.rows);
    level.insert(floorLayer);
    level.insert(wallLayer);
    level.syncAll();

    const spawn = this._resolveSpawn(level, data, entryId);
    return {
      level,
      spawn,
      wallLayer,
      floorLayer,
      wallType,
      floorType,
      colliders: [],
    };
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
