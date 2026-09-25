const LOG_CAP = 256; // cell writes kept for replay before a reader behind them resamples everything

/**
 * A level layer of TileType cells and the solid colliders meshed from them. `emptyCost` controls
 * empty-cell nav: undefined passes through to lower layers; Infinity makes a blocking base.
 * `edits` counts every cell write and is a reader's cursor: `log` holds the cells of writes
 * `base`+1..`edits` in order, so a reader replays only what it missed and a single paint costs it
 * one resample, not the level's. The log is shared and never drained — any number of readers keep
 * their own cursor — and bounded, so a reader too far behind resamples every cell. A cell write
 * and a remesh are each seen by nav on its own, so no resync call follows.
 * An empty cell reads 0, not undefined, so occupancy is a truthy test, never `!== undefined`.
 *
 * A cell holds a palette index, not the TileType: `ids` is the level-sized index channel (0 =
 * empty) and `types` the layer's palette, index → TileType, grown by `bind` in first-use order —
 * so a bulk consumer walks plain numbers, and a TileType's `id` is only its save name.
 * @implements {LevelLayer}
 */
globalThis.TileLayer = class TileLayer {
  /** @param {LevelGrid} tiles the grid whose shape the layer takes */
  constructor(tiles, opt = {}) {
    this.cols = tiles.cols;
    this.rows = tiles.rows;
    this.ids = tiles.alloc();
    this.types = [0];
    this.emptyCost = opt.emptyCost;
    this.edits = 0;
    this.log = [];
    this.base = 0;
  }

  destroy() {
    this.ids.destroy();
    this.ids = undefined;
    this.types = undefined;
  }

  /** The palette index of `type`, appended on first use. */
  bind(type) {
    const types = this.types;
    for (let i = 1; i < types.length; i++) if (types[i] === type) return i;
    types.push(type);
    return types.length - 1;
  }

  /** Caller must remesh after editing a solid layer. */
  set(x, y, type) {
    const i = y * this.cols + x;
    this.ids.data[i] = type ? this.bind(type) : 0;
    this.edits++;
    const log = this.log;
    if (log.length === LOG_CAP) {
      log.length = 0;
      this.base = this.edits - 1; // a reader caught up before this write still replays it
    }
    log.push(i);
    return this;
  }

  /** Marks every cell edited, after a bulk write straight into `ids`. */
  touchAll() {
    this.edits++;
    this.log.length = 0;
    this.base = this.edits;
  }

  /** Where a reader at edit `seen` resumes in `log`; -1 when it must resample every cell. */
  since(seen) {
    return seen < this.base ? -1 : seen - this.base;
  }

  clear(x, y) {
    return this.set(x, y, undefined);
  }

  get(x, y) {
    return this.types[this.ids.data[y * this.cols + x]];
  }

  occupied(x, y) {
    return this.ids.data[y * this.cols + x] !== 0;
  }

  costAt(x, y) {
    const type = this.types[this.ids.data[y * this.cols + x]];
    return type ? type.pathCost : this.emptyCost;
  }

  /** The solid cells as the fewest [gx,gy,wCells,hCells] rects. */
  meshRects() {
    const d = this.ids.data;
    const cols = this.cols;
    return Grid.meshRects(cols, this.rows, (x, y) => d[y * cols + x] !== 0);
  }

  /** One kinematic-solid collider per rect, sized by the level `grid`; ids pushed onto `out`. */
  meshSolid(entities, grid, out) {
    Colliders.boxes(entities, this.meshRects(), grid.cellWidth, grid.cellHeight, out);
  }

  /** Replaces `colliders` in place; flushes first so old ids don't collide. */
  remesh(entities, grid, colliders) {
    for (let i = 0; i < colliders.length; i++) entities.remove(colliders[i]);
    entities.flush();
    colliders.length = 0;
    this.meshSolid(entities, grid, colliders);
  }
};
