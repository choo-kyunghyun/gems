// Windowed cost grid for pathfinding over the chunk-streamed overworld: adapts the LIVE World
// colliders (blocked) plus an injected terrain-cost sampler (weighted ground — see constructor)
// into MotionPlanner's MotionPlanningGrid interface, in ABSOLUTE level-cell coords over a small
// fixed window re-centered on the agent each frame.
//
// why a window: obstacles aren't tile data — terrain/walls/border exist only as kinematic-solid
// collider ENTITIES (and on a chunked map only nearby chunks are loaded). one bounded grid
// unifies every obstacle source and keeps size() constant, so MotionPlanner.setGrid runs ONCE
// while only occupancy/origin change per frame. This is the ONE live nav source — the tile
// layers' costs (LevelGrid.costAt) feed only the debug cost shading.
//
// coords: inBounds/get/toIndex/toPosition speak ABSOLUTE cells; the window origin maps to a local
// buffer, so paths come back in absolute cells. GMRT-safe: for-of over the world.query ARRAY is
// fine (only Map/Set iterators break).
globalThis.NavGrid = class NavGrid {
  // `costAt` (optional): (wx, wy) → terrain movement cost (1 = easy, >1 = rough, Infinity =
  // impassable) sampled per cell so MotionPlanner weights routes (it multiplies step distance by
  // cell cost — a wade is chosen only when shorter than walking around). null → every cell costs 1.
  constructor(cols, rows, cellW, cellH, costAt = null) {
    this.cols = cols;
    this.rows = rows;
    this.cellW = cellW;
    this.cellH = cellH;
    this.grid = new Grid(cols, rows); // costs: ≥1 = walkable (weighted), Infinity = blocked
    this.originX = 0; // absolute cell of the window's top-left
    this.originY = 0;
    this.costAt = costAt;
    this._terrain = null; // cached per-window terrain costs; resampled only when the origin moves
  }

  destroy() {
    this.grid.destroy();
    this.grid = undefined;
  }

  // CONSTANT (window dims) so the planner's setGrid scratch arrays stay valid across rebuilds
  size() {
    return this.cols * this.rows;
  }

  // re-center, fill with terrain costs (or 1), stamp each kinematic-solid collider's footprint as
  // blocked. walls only — dynamic bodies are non-kinematic so agents don't block each other's
  // planning. call once per frame OUTSIDE the tick loop.
  rebuild(world, centerGx, centerGy) {
    const ox = centerGx - (this.cols >> 1);
    const oy = centerGy - (this.rows >> 1);
    const moved =
      ox !== this.originX || oy !== this.originY || this._terrain === null;
    this.originX = ox;
    this.originY = oy;

    const d = this.grid.data;
    if (this.costAt === null) {
      for (let i = 0; i < d.length; i++) d[i] = 1; // fill in place (no realloc)
    } else {
      // terrain is static per cell — resample only when the window moves; colliders re-stamp
      // every rebuild on top of a copy of the cached base
      if (moved) this._sampleTerrain();
      const t = this._terrain;
      for (let i = 0; i < d.length; i++) d[i] = t[i];
    }

    const cw = this.cellW;
    const ch = this.cellH;
    for (const id of world.query(Collision, Position, BBox)) {
      const col = world.get(Collision, id);
      if (!col.solid || !col.kinematic) continue;
      const e = AABB.of(world, id);
      // inclusive cell range (x2/y2 are exclusive edges, so -1)
      let gx0 = Math.floor(e.x1 / cw);
      let gy0 = Math.floor(e.y1 / ch);
      let gx1 = Math.floor((e.x2 - 1) / cw);
      let gy1 = Math.floor((e.y2 - 1) / ch);
      // clamp to window before stamping
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

  // sample the injected terrain cost at each window cell's center (world coords)
  _sampleTerrain() {
    if (this._terrain === null)
      this._terrain = new Array(this.cols * this.rows);
    const t = this._terrain;
    const cw = this.cellW;
    const ch = this.cellH;
    for (let ly = 0; ly < this.rows; ly++)
      for (let lx = 0; lx < this.cols; lx++)
        t[ly * this.cols + lx] = this.costAt(
          (this.originX + lx + 0.5) * cw,
          (this.originY + ly + 0.5) * ch,
        );
  }

  // absolute-cell MotionPlanningGrid view
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
