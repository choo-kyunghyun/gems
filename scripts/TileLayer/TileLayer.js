/** @implements {LevelLayer} */
globalThis.TileLayer = class TileLayer {
  /**
   * @param {number} width
   * @param {number} height
   * @param {Object} [opt]
   * @param {number} [opt.emptyCost] nav cost reported for empty cells.
   *   `undefined` (default) passes through to lower layers; use `Infinity`
   *   for a blocking base layer (the former `Terrain` behavior).
   */
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
