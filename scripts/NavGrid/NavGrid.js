/**
 * The level's pathfinding state: the level-sized cost grid every planner query shares, one cell
 * per level cell — ≥ 1 walkable (terrain-weighted, so a wade is chosen only when shorter than
 * walking around), Infinity blocked — with the planner's working record and the fairness cursor
 * the serving system resumes from.
 *
 * Two sources, each with its own refresh signal, composed base-then-stamp so neither re-reads the
 * other's input:
 *   - the tile layers' cost is the base, resampled by `sync` only where a layer's edit cursor
 *     moved;
 *   - the kinematic-solid colliders are stamped over a copy of the base by `stamp`, with the
 *     collider generation they were taken at, so the one live blocking source is polled by
 *     number. Dynamic bodies never enter: agents don't block each other's planning.
 */
globalThis.NavGrid = class NavGrid {
  /** @param {LevelGrid} tiles the level this grid mirrors */
  constructor(tiles) {
    this.tiles = tiles;
    this.grid = tiles.alloc(); // the composed costs
    this.scratch = MotionPlanner.scratch(tiles.size);
    this.cursor = 0;
    this._base = tiles.alloc(); // terrain costs alone
    this._cells = { x0: 0, y0: 0, x1: 0, y1: 0 }; // a static's cell range, reused per stamp
    this._layers = null; // the layer stack the base was sampled from; null = never
    this._seen = []; // per layer, the edit count the base was sampled at
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
   * Resample the base where the layers were edited since the last sync, then recompose —
   * everything on the first sync, after a bulk paint, or when the layer stack changed. Once per
   * frame, before the sim. Returns whether it resampled.
   */
  sync() {
    const tiles = this.tiles;
    const layers = tiles.layers;
    const seen = this._seen;
    let held = this._layers;
    let all = held === null || held.length !== layers.length;
    let moved = all;
    for (let i = 0; i < layers.length && !all; i++) {
      const layer = layers[i];
      if (held[i] !== layer) {
        all = true;
        moved = true;
      } else if (layer.edits !== seen[i]) {
        moved = true;
        if (layer.since(seen[i]) < 0) all = true;
      }
    }
    if (!moved) return false;

    // every layer spans the level, so a layer's cell index is this grid's
    const b = this._base.data;
    const cols = tiles.cols;
    if (all) {
      for (let y = 0; y < tiles.rows; y++)
        for (let x = 0; x < cols; x++) b[y * cols + x] = tiles.costAt(x, y);
    } else {
      for (let i = 0; i < layers.length; i++) {
        const log = layers[i].log;
        for (let k = layers[i].since(seen[i]); k < log.length; k++) {
          const idx = log[k];
          b[idx] = tiles.costAt(idx % cols, Math.floor(idx / cols));
        }
      }
    }
    if (held === null) held = this._layers = [];
    held.length = layers.length;
    seen.length = layers.length;
    for (let i = 0; i < layers.length; i++) {
      held[i] = layers[i];
      seen[i] = layers[i].edits;
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

    const tiles = this.tiles;
    const cols = tiles.cols;
    const c = this._cells;
    const statics = this.statics;
    for (let i = 0; i < statics.length; i++) {
      tiles.cellRect(statics[i], c);
      for (let gy = c.y0; gy < c.y1; gy++)
        for (let gx = c.x0; gx < c.x1; gx++) d[gy * cols + gx] = Infinity;
    }
  }
};
