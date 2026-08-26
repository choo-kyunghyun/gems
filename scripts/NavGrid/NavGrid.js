/**
 * The level-sized cost grid every planner query shares, one cell per LevelGrid cell: ≥ 1 =
 * walkable (terrain-weighted — MotionPlanner multiplies step distance by cell cost, so a wade is
 * chosen only when shorter than walking around), Infinity = blocked. `grid` is the plain Grid
 * MotionPlanner.setGrid points at; its size is the level's, so setGrid runs once per map.
 *
 * Two sources, each with its own refresh signal, composed base-then-stamp so neither re-reads the
 * other's input:
 *   - the tile layers' cost (LevelGrid.costAt) is the BASE, cached and resampled by `sync` only
 *     when the level's edit counter moves (a tile paint);
 *   - the kinematic-solid colliders (walls, water, the level border, a closed door) are STAMPED
 *     over a copy of the base by `stamp`, fed the static snapshot SolidSystem already keeps —
 *     it fires `onStatics` only when that set actually changes, so this is the ONE live blocking
 *     source and there is no polling. Dynamic bodies never enter (agents don't block each
 *     other's planning; SeparationSystem keeps them apart).
 */
globalThis.NavGrid = class NavGrid {
  /** @param {LevelGrid} tiles the level this grid mirrors (dims, cell size, and the cost source) */
  constructor(tiles) {
    this.tiles = tiles;
    this.cols = tiles.cols;
    this.rows = tiles.rows;
    this.cellW = tiles.cellWidth;
    this.cellH = tiles.cellHeight;
    this.grid = new Grid(this.cols, this.rows); // the composed costs the planner reads
    this._base = new Grid(this.cols, this.rows); // terrain costs alone
    this._edits = -1; // tiles.edits() the base was sampled at; -1 = never
    this._statics = []; // the last stamped snapshot, re-applied when the base resamples
  }

  destroy() {
    this.grid.destroy();
    this._base.destroy();
    this.grid = undefined;
    this._base = undefined;
    this.tiles = undefined;
  }

  /**
   * Mirror the tile layers' cost into the base when they have been edited since the last sample,
   * then recompose. Only the cells the layers report dirty are resampled (a paint is one cell; a
   * whole-level costAt pass is ~50 ms) — everything on the first sync or after a bulk paint. Once
   * per frame, outside the tick loop (SimClock). Returns whether it resampled.
   */
  sync() {
    const tiles = this.tiles;
    const edits = tiles.edits();
    if (edits === this._edits) return false;
    const layers = tiles.layers;
    let all = this._edits === -1;
    this._edits = edits;
    for (let i = 0; i < layers.length; i++) if (layers[i].dirtyAll) all = true;

    // a layer's cell index is this grid's index (every layer spans the level's cols×rows)
    const b = this._base.data;
    const cols = this.cols;
    if (all) {
      for (let y = 0; y < this.rows; y++)
        for (let x = 0; x < cols; x++) b[y * cols + x] = tiles.costAt(x, y);
    } else {
      for (let i = 0; i < layers.length; i++) {
        const dirty = layers[i].dirty;
        for (let k = 0; k < dirty.length; k++) {
          const idx = dirty[k];
          b[idx] = tiles.costAt(idx % cols, Math.floor(idx / cols));
        }
      }
    }
    for (let i = 0; i < layers.length; i++) {
      layers[i].dirty.length = 0;
      layers[i].dirtyAll = false;
    }
    this._compose();
    return true;
  }

  /**
   * Take the kinematic-solid snapshot (`{x1,y1,x2,y2}` world px each, x2/y2 exclusive) as the
   * blocking set and recompose. The array is kept by reference — SolidSystem replaces it, never
   * mutates it in place.
   */
  stamp(statics) {
    this._statics = statics;
    this._compose();
  }

  /** base copy, then every static's footprint (clipped to the level) → Infinity */
  _compose() {
    // whole-grid refill over Grid's public `data` buffer (its contract blesses bulk direct access)
    const d = this.grid.data;
    const b = this._base.data;
    for (let i = 0; i < d.length; i++) d[i] = b[i];

    const cw = this.cellW;
    const ch = this.cellH;
    const cols = this.cols;
    const rows = this.rows;
    const statics = this._statics;
    for (let i = 0; i < statics.length; i++) {
      const s = statics[i];
      // inclusive cell range (x2/y2 are exclusive edges, so -1)
      let gx0 = Math.floor(s.x1 / cw);
      let gy0 = Math.floor(s.y1 / ch);
      let gx1 = Math.floor((s.x2 - 1) / cw);
      let gy1 = Math.floor((s.y2 - 1) / ch);
      if (gx0 < 0) gx0 = 0;
      if (gy0 < 0) gy0 = 0;
      if (gx1 > cols - 1) gx1 = cols - 1;
      if (gy1 > rows - 1) gy1 = rows - 1;
      for (let gy = gy0; gy <= gy1; gy++)
        for (let gx = gx0; gx <= gx1; gx++) d[gy * cols + gx] = Infinity;
    }
  }
};
