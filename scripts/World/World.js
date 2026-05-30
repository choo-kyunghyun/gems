/**
 * @typedef {Object} TileType
 * @property {number} id
 * @property {string} name
 * @property {number} pathCost
 */

/**
 * @typedef {{ cost: number | undefined }} NavData
 */

/**
 * @typedef {Object} WorldLayer
 * @property {function(number, number): TileType | undefined} get
 * @property {function(number, number, TileType | undefined): WorldLayer} set
 * @property {function(number, number): NavData} getNavData
 * @property {function(): Object} export
 * @property {function(Object): void} import
 * @property {function(): void} destroy
 */

globalThis.World = class World {
  constructor(opt = {}) {
    this.cellWidth = opt.cellWidth ?? 32;
    this.cellHeight = opt.cellHeight ?? 32;
    this.cols = opt.cols ?? Math.floor(room_width / this.cellWidth);
    this.rows = opt.rows ?? Math.floor(room_height / this.cellHeight);
    this.mpg = new MotionPlanningGrid(this.cols, this.rows);

    /** @type {WorldLayer[]} */
    this.layers = [];

    PathfindingSystem.setGrid(this.mpg);
  }

  addLayer(layer) {
    this.layers.push(layer);
    return this;
  }

  removeLayer(layer) {
    const i = this.layers.indexOf(layer);
    if (i >= 0) this.layers.splice(i, 1);
    return this;
  }

  _computeNav(x, y) {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const nav = this.layers[i].getNavData(x, y);
      if (nav.cost !== undefined) return nav.cost;
    }
    return Infinity;
  }

  syncAt(x, y) {
    this.mpg.set(x, y, this._computeNav(x, y));
    PathfindingSystem.invalidate();
    return this;
  }

  syncAll() {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        this.mpg.set(x, y, this._computeNav(x, y));
      }
    }
    PathfindingSystem.invalidate();
    return this;
  }

  worldToGrid(wx, wy) {
    return {
      x: Math.floor(wx / this.cellWidth),
      y: Math.floor(wy / this.cellHeight),
    };
  }

  gridToWorld(gx, gy) {
    return {
      x: gx * this.cellWidth + this.cellWidth * 0.5,
      y: gy * this.cellHeight + this.cellHeight * 0.5,
    };
  }

  update() {}

  export() {
    return {
      cellWidth: this.cellWidth,
      cellHeight: this.cellHeight,
      cols: this.cols,
      rows: this.rows,
      layers: this.layers.map((layer) => layer.export()),
    };
  }

  import(data) {
    for (let i = 0; i < this.layers.length; i++) {
      if (data.layers[i] !== undefined) {
        this.layers[i].import(data.layers[i]);
      }
    }
    this.syncAll();
    return this;
  }

  destroy() {
    for (let i = 0; i < this.layers.length; i++) {
      this.layers[i].destroy();
    }
    this.mpg.destroy();
    this.mpg = undefined;
    this.layers = [];
  }
};
