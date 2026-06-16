/**
 * The built-in LevelLayer: a Grid of TileType cells. Empty cells report `emptyCost` for nav
 * (undefined passes through to lower layers; Infinity makes a blocking base). @implements {LevelLayer}
 */
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

  /** Free the backing grid. */
  destroy() {
    this.grid.destroy();
    this.grid = undefined;
  }

  /** @returns {Object} serializable grid data. */
  export() {
    return this.grid.export();
  }

  /** @param {Object} data a prior export(). */
  import(data) {
    this.grid = Grid.import(data);
  }

  /**
   * Build a layer from exported grid data.
   * @param {{width:number,height:number}} data
   * @param {Object} [opt] forwarded to the constructor (e.g. emptyCost).
   * @returns {TileLayer}
   */
  static from(data, opt) {
    const layer = new TileLayer(data.width, data.height, opt);
    layer.import(data);
    return layer;
  }

  /** @param {number} x @param {number} y @param {TileType|undefined} type @returns {TileLayer} this */
  set(x, y, type) {
    this.grid.set(x, y, type);
    return this;
  }

  /** @param {number} x @param {number} y @returns {TileType|undefined} */
  get(x, y) {
    return this.grid.get(x, y);
  }

  /** @param {number} x @param {number} y @returns {NavData} cost from the cell's TileType, else emptyCost. */
  getNavData(x, y) {
    const type = this.grid.get(x, y);
    return { cost: type ? type.pathCost : this.emptyCost };
  }
};
