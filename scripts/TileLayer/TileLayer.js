/**
 * LevelLayer: a Grid of TileType cells. `emptyCost` controls empty-cell nav:
 * undefined passes through to lower layers; Infinity makes a blocking base.
 * @implements {LevelLayer}
 */
globalThis.TileLayer = class TileLayer {
  constructor(width, height, opt = {}) {
    this.grid = new Grid(width, height);
    this.emptyCost = opt.emptyCost;
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
  }

  static from(data, opt) {
    const layer = new TileLayer(data.width, data.height, opt);
    layer.import(data);
    return layer;
  }

  set(x, y, type) {
    this.grid.set(x, y, type);
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
