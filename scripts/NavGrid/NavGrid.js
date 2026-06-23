// Windowed occupancy grid for pathfinding over a STREAMED / unbounded-in-practice world (the
// chunk-streamed RPG overworld). It adapts the LIVE World colliders into the MotionPlanningGrid
// interface MotionPlanner consumes, presented in ABSOLUTE level-cell coordinates over a small,
// fixed-size window re-centered on the agent each frame.
//
// Why a window instead of one big grid: on a chunked map the obstacle data is NOT in Level.mpg —
// the terrain (procedural rocks, prefab + authored-hub walls, the world border) exists only as
// kinematic-solid collider ENTITIES (ChunkManager._meshColliders / RpgLevel.buildWorldBorder /
// build-mode TileEdit), and only the chunks near the player are even loaded. Reading live colliders
// into a bounded window unifies every obstacle source (streamed terrain + player builds + border +
// plain-interior walls) into one cheap grid, and keeps size() constant so MotionPlanner.setGrid is
// called ONCE while only occupancy/origin change per frame.
//
// Coordinates: all of inBounds/get/toIndex/toPosition speak ABSOLUTE level cells (same space as
// level.worldToGrid / gridToWorld). Internally that maps to a local [0,cols)x[0,rows) buffer via the
// window origin, so paths come back in absolute cells (RenderDebugPath / CombatAI convert straight
// through level.gridToWorld). MotionPlanner is unchanged.
//
// GMRT-safe: for-of over the world.query ARRAY is fine (only Map/Set iterators break); class on
// globalThis; index loops for the cell raster.
globalThis.NavGrid = class NavGrid {
  constructor(cols, rows, cellW, cellH) {
    this.cols = cols;
    this.rows = rows;
    this.cellW = cellW;
    this.cellH = cellH;
    this.grid = new Grid(cols, rows); // costs: 1 = walkable, Infinity = blocked
    this.originX = 0; // absolute cell of the window's top-left
    this.originY = 0;
  }

  destroy() {
    this.grid.destroy();
    this.grid = undefined;
  }

  // MotionPlanningGrid contract — size is CONSTANT (window dims), so the planner's scratch arrays
  // allocated by setGrid stay valid across rebuilds; only occupancy + origin move.
  size() {
    return this.cols * this.rows;
  }

  // Re-center the window on a cell, clear to walkable, then stamp every kinematic-solid collider's
  // footprint as blocked. Walls only — dynamic bodies (slimes/player) are non-kinematic so agents
  // don't block each other's planning. Call once per frame OUTSIDE the tick loop.
  rebuild(world, centerGx, centerGy) {
    this.originX = centerGx - (this.cols >> 1);
    this.originY = centerGy - (this.rows >> 1);

    const d = this.grid.data;
    for (let i = 0; i < d.length; i++) d[i] = 1; // fill in place (no realloc)

    const cw = this.cellW;
    const ch = this.cellH;
    for (const id of world.query(Collision, Position, BBox)) {
      const col = world.get(Collision, id);
      if (!col.solid || !col.kinematic) continue;
      const e = AABB.of(world, id);
      // Cell-aligned wall rect → inclusive cell range (x2/y2 are exclusive edges, so -1).
      let gx0 = Math.floor(e.x1 / cw);
      let gy0 = Math.floor(e.y1 / ch);
      let gx1 = Math.floor((e.x2 - 1) / cw);
      let gy1 = Math.floor((e.y2 - 1) / ch);
      // Clamp to the window in absolute cells before stamping.
      if (gx0 < this.originX) gx0 = this.originX;
      if (gy0 < this.originY) gy0 = this.originY;
      if (gx1 > this.originX + this.cols - 1)
        gx1 = this.originX + this.cols - 1;
      if (gy1 > this.originY + this.rows - 1)
        gy1 = this.originY + this.rows - 1;
      for (let ay = gy0; ay <= gy1; ay++)
        for (let ax = gx0; ax <= gx1; ax++)
          d[(ay - this.originY) * this.cols + (ax - this.originX)] = Infinity;
    }
  }

  // ── absolute-cell MotionPlanningGrid view ──────────────────────────────────
  inBounds(ax, ay) {
    const lx = ax - this.originX;
    const ly = ay - this.originY;
    return lx >= 0 && lx < this.cols && ly >= 0 && ly < this.rows;
  }

  toIndex(ax, ay) {
    return (ay - this.originY) * this.cols + (ax - this.originX);
  }

  toPosition(index) {
    return {
      x: this.originX + (index % this.cols),
      y: this.originY + Math.floor(index / this.cols),
    };
  }

  get(ax, ay) {
    if (!this.inBounds(ax, ay)) return Infinity;
    return this.grid.data[this.toIndex(ax, ay)];
  }
};
