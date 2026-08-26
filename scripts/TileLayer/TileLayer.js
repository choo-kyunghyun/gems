const DIRTY_CAP = 256; // cell writes tracked individually before a mirror just resamples everything

/**
 * LevelLayer: a Grid of TileType cells. `emptyCost` controls empty-cell nav:
 * undefined passes through to lower layers; Infinity makes a blocking base.
 * `edits` counts every cell write (set/import) — the signal NavGrid resamples its cost mirror on —
 * and `dirty`/`dirtyAll` say WHICH cells, so a single build-mode paint is one resample, not the
 * level's: the indexes written since the mirror last drained them, or everything once a bulk
 * paint (a level build, an import) passes DIRTY_CAP. One mirror drains it (NavGrid.sync); a
 * second would need its own cursor.
 * @implements {LevelLayer}
 */
globalThis.TileLayer = class TileLayer {
  constructor(width, height, opt = {}) {
    this.grid = new Grid(width, height);
    this.emptyCost = opt.emptyCost;
    this.edits = 0;
    this.dirty = [];
    this.dirtyAll = false;
  }

  destroy() {
    this.grid.destroy();
    this.grid = undefined;
  }

  export() {
    return this.grid.export();
  }

  import(data) {
    this.grid = Grid.import(data);
    this.edits++;
    this.dirtyAll = true;
    this.dirty.length = 0;
  }

  static from(data, opt) {
    const layer = new TileLayer(data.width, data.height, opt);
    layer.import(data);
    return layer;
  }

  set(x, y, type) {
    this.grid.set(x, y, type);
    this.edits++;
    if (!this.dirtyAll) {
      if (this.dirty.length < DIRTY_CAP) this.dirty.push(this.grid.toIndex(x, y));
      else {
        this.dirtyAll = true;
        this.dirty.length = 0;
      }
    }
    return this;
  }

  get(x, y) {
    return this.grid.get(x, y);
  }

  getNavData(x, y) {
    const type = this.grid.get(x, y);
    return { cost: type ? type.pathCost : this.emptyCost };
  }
};
