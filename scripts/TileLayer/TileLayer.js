const LOG_CAP = 256; // cell writes kept for replay before a reader behind them resamples everything

/**
 * A level layer of TileType cells. `emptyCost` controls empty-cell nav: undefined passes through
 * to lower layers; Infinity makes a blocking base.
 * `edits` counts every cell write and is a reader's cursor: `log` holds the cells of writes
 * `base`+1..`edits` in order, so a reader replays only what it missed and a single paint costs it
 * one resample, not the level's. The log is shared and never drained — any number of readers keep
 * their own cursor — and bounded, so a reader too far behind resamples every cell. A cell write
 * is seen by every reader on its own, so no resync call follows.
 * An empty cell reads 0, not undefined, so occupancy is a truthy test, never `!== undefined`.
 *
 * A cell holds its TileType's `id`: `ids` is the level-sized id channel (0 = empty) and `types`
 * the layer's table, id → TileType, filled by `bind` — so a bulk consumer walks plain numbers that
 * mean the same on disk. A type's id is a u16 above 0, held by one type per layer.
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

  /** Enters `type` under its id; throws on an id out of range or held by another type. */
  bind(type) {
    const id = type.id;
    if (Number.isInteger(id) === false || id < 1 || id > 0xffff)
      throw new Error(`TileLayer.bind: id ${id} is not a u16 above 0`);
    const held = this.types[id];
    if (held === type) return id;
    if (held !== undefined)
      throw new Error(`TileLayer.bind: id ${id} is held by another type`);
    this.types[id] = type;
    return id;
  }

  set(x, y, type) {
    const i = y * this.cols + x;
    this.ids.data[i] = type ? (this.types[type.id] === type ? type.id : this.bind(type)) : 0;
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
};
