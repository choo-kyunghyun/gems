/**
 * LevelLayer: a Grid of TileType cells. `emptyCost` controls empty-cell nav:
 * undefined passes through to lower layers; Infinity makes a blocking base.
 * @implements {LevelLayer}
 */
globalThis.TileLayer = class TileLayer {
  /**
   * @param {number} width
   * @param {number} height
   * @param {{ emptyCost?: number }} [opt]
   */
  constructor(width, height, opt = {}) {
    this.grid = new Grid(width, height);
    this.emptyCost = opt.emptyCost;
  }

  destroy() {
    this.grid.destroy();
    this.grid = undefined;
  }

  /** @returns {{width:number,height:number,data:any[]}} */
  export() {
    return this.grid.export();
  }

  /** @param {{width:number,height:number,data:any[]}} data */
  import(data) {
    this.grid = Grid.import(data);
  }

  /**
   * @param {{width:number,height:number}} data
   * @param {Object} [opt]
   * @returns {TileLayer}
   */
  static from(data, opt) {
    const layer = new TileLayer(data.width, data.height, opt);
    layer.import(data);
    return layer;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {TileType|undefined} type
   * @returns {TileLayer} this
   */
  set(x, y, type) {
    this.grid.set(x, y, type);
    return this;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {TileType|undefined}
   */
  get(x, y) {
    return this.grid.get(x, y);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @returns {NavData}
   */
  getNavData(x, y) {
    const type = this.grid.get(x, y);
    return { cost: type ? type.pathCost : this.emptyCost };
  }
};
