globalThis.Grid2D = class Grid2D {
  constructor(width, height) {
    this.rows = height;
    this.cols = width;
  }

  getWidth() {
    return this.cols;
  }

  getHeight() {
    return this.rows;
  }

  cellCount() {
    return this.rows * this.cols;
  }

  createArray(value = 0) {
    return Array(this.cellCount()).fill(value);
  }

  inBounds(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }

  toIndex(x, y) {
    return y * this.cols + x;
  }

  toXy(index) {
    return { x: index % this.cols, y: Math.floor(index / this.cols) };
  }
};
