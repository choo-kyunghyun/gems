/**
 * Fixed-size 2D grid backed by a flat row-major array — the storage primitive
 * under `TileLayer`, `ZoneMap`, `NavGrid`, and `Level.mpg`. Cells hold any value
 * (tile/zone ids, nav costs); the array starts filled with 0.
 */
globalThis.Grid = class Grid {
  /** @param {number} width columns @param {number} height rows */
  constructor(width, height) {
    this.rows = height;
    this.cols = width;
    this.data = Array(this.size()).fill(0);
  }

  /** Release the backing array. */
  destroy() {
    this.data = undefined;
  }

  /** @returns {{width:number,height:number,data:any[]}} a serializable copy (data cloned). */
  export() {
    return {
      width: this.cols,
      height: this.rows,
      data: this.data.slice(),
    };
  }

  /** @param {{width:number,height:number,data:any[]}} data @returns {Grid} a grid restored from export(). */
  static import(data) {
    const grid = new Grid(data.width, data.height);
    grid.data = data.data;
    return grid;
  }

  /** @returns {number} total cell count (cols × rows). */
  size() {
    return this.rows * this.cols;
  }

  /** @returns {boolean} whether (x, y) lies inside the grid. */
  inBounds(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }

  /** @param {number} x @param {number} y @returns {number} flat array index for a cell. */
  toIndex(x, y) {
    return y * this.cols + x;
  }

  /** @param {number} index @returns {{x:number,y:number}} cell coords for a flat index. */
  toPosition(index) {
    return { x: index % this.cols, y: Math.floor(index / this.cols) };
  }

  /** Fill every cell with `value`. @returns {Grid} this */
  clear(value) {
    this.data = Array(this.size()).fill(value);
    return this;
  }

  /** Set one cell (no bounds check — guard with inBounds). @returns {Grid} this */
  set(x, y, value) {
    this.data[this.toIndex(x, y)] = value;
    return this;
  }

  /** @returns {*} the value at (x, y) (no bounds check). */
  get(x, y) {
    return this.data[this.toIndex(x, y)];
  }
};
