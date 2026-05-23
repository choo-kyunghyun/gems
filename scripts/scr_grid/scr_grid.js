globalThis.Grid = class Grid {
  constructor(width, height) {
    this.rows = height;
    this.cols = width;
    this.data = Array(this.size()).fill(0);
  }

  destroy() {
    this.data = undefined;
  }

  export() {
    return {
      width: this.cols,
      height: this.rows,
      data: this.data,
    };
  }

  static import(data) {
    const grid = new Grid(data.width, data.height);
    grid.data = data.data;
    return grid;
  }

  width() {
    return this.cols;
  }

  height() {
    return this.rows;
  }

  size() {
    return this.rows * this.cols;
  }

  inBounds(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }

  toIndex(x, y) {
    return y * this.cols + x;
  }

  toPosition(index) {
    return { x: index % this.cols, y: Math.floor(index / this.cols) };
  }

  clear(value) {
    this.data = Array(this.size()).fill(value);
    return this;
  }

  set(x, y, value) {
    this.data[this.toIndex(x, y)] = value;
    return this;
  }

  get(x, y) {
    return this.data[this.toIndex(x, y)];
  }
};
