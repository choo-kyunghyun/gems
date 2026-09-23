/**
 * The level's pathfinding state: the level-sized cost grid every planner query shares, one cell
 * per level cell — ≥ 1 walkable (terrain-weighted, so a wade is chosen only when shorter than
 * walking around), Infinity blocked — with the planner's working record and the fairness cursor
 * the serving system resumes from.
 *
 * Two sources, each with its own refresh signal, composed base-then-stamp so neither re-reads the
 * other's input:
 *   - the tile layers' cost is the base, resampled by `sync` only when the level's edit counter
 *     moves;
 *   - the kinematic-solid colliders are stamped over a copy of the base by `stamp`, with the
 *     collider generation they were taken at, so the one live blocking source is polled by
 *     number. Dynamic bodies never enter: agents don't block each other's planning.
 */
globalThis.NavGrid = class NavGrid {
  /** @param {LevelGrid} tiles the level this grid mirrors */
  constructor(tiles) {
    this.tiles = tiles;
    this.cols = tiles.cols;
    this.rows = tiles.rows;
    this.cellW = tiles.cellWidth;
    this.cellH = tiles.cellHeight;
    this.grid = new Grid(this.cols, this.rows); // the composed costs
    this.scratch = MotionPlanner.scratch(this.grid.size());
    this.cursor = 0;
    this._base = new Grid(this.cols, this.rows); // terrain costs alone
    this._edits = -1; // the edit count the base was sampled at; -1 = never
    this.statics = []; // the last stamped snapshot, re-applied when the base resamples
    this.gen = -1; // the collider generation the snapshot was taken at; -1 = never
  }

  destroy() {
    this.grid.destroy();
    this._base.destroy();
    this.grid = undefined;
    this.scratch = undefined;
    this._base = undefined;
    this.tiles = undefined;
  }

  /**
   * Resample the base where the layers were edited, then recompose — only the dirty cells, or
   * everything on the first sync or after a bulk paint. Once per frame, before the sim. Returns
   * whether it resampled.
   */
  sync() {
    const tiles = this.tiles;
    const edits = tiles.edits();
    if (edits === this._edits) return false;
    const layers = tiles.layers;
    let all = this._edits === -1;
    this._edits = edits;
    for (let i = 0; i < layers.length; i++) if (layers[i].dirtyAll) all = true;

    // every layer spans the level, so a layer's cell index is this grid's
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
   * Take the kinematic-solid snapshot (`{x1,y1,x2,y2}` world px, x2/y2 exclusive) from collider
   * generation `gen` as the blocking set. Kept by reference: the caller replaces the array, never
   * mutates it.
   */
  stamp(statics, gen = -1) {
    this.gen = gen;
    this.statics = statics;
    this._compose();
  }

  _compose() {
    const d = this.grid.data;
    const b = this._base.data;
    for (let i = 0; i < d.length; i++) d[i] = b[i];

    const cw = this.cellW;
    const ch = this.cellH;
    const cols = this.cols;
    const rows = this.rows;
    const statics = this.statics;
    for (let i = 0; i < statics.length; i++) {
      const s = statics[i];
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
