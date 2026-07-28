// Flat row-major 2D array; used by TileLayer, ZoneMap, NavGrid.
/**
 * `data` is PUBLIC: a bulk consumer walks the row-major buffer directly (NavGrid refills its
 * whole window every frame — a per-cell set() there would be a call per cell); single-cell
 * access still goes through get/set. clear() fills IN PLACE, so a held `data` reference stays
 * valid across it.
 */
globalThis.Grid = class Grid {
  /** @param {number} width @param {number} height */
  constructor(width, height) {
    this.rows = height;
    this.cols = width;
    this.data = Array(this.size()).fill(0);
  }

  destroy() {
    this.data = undefined;
  }

  /** @returns {{width:number,height:number,data:any[]}} */
  export() {
    return {
      width: this.cols,
      height: this.rows,
      data: this.data.slice(),
    };
  }

  /** @param {{width:number,height:number,data:any[]}} data @returns {Grid} */
  static import(data) {
    const grid = new Grid(data.width, data.height);
    grid.data = data.data;
    return grid;
  }

  size() {
    return this.rows * this.cols;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }

  /** @param {number} x @param {number} y @returns {number} */
  toIndex(x, y) {
    return y * this.cols + x;
  }

  /** @param {number} index @returns {{x:number,y:number}} */
  toPosition(index) {
    return { x: index % this.cols, y: Math.floor(index / this.cols) };
  }

  /** Fill every cell with `value`, in place. @returns {Grid} this */
  clear(value) {
    this.data.fill(value);
    return this;
  }

  /** no bounds check — guard with inBounds. @returns {Grid} this */
  set(x, y, value) {
    this.data[this.toIndex(x, y)] = value;
    return this;
  }

  get(x, y) {
    return this.data[this.toIndex(x, y)];
  }
};
