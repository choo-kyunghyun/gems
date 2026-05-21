global.Grid2D = class Grid2D {
  constructor(width, height) {
    this.rows = height;
    this.cols = width;
  }

  cell_count() {
    return this.rows * this.cols;
  }

  create_array(value = 0) {
    return Array(this.cell_count).fill(value);
  }

  in_bounds(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }

  to_index(x, y) {
    return y * this.cols + x;
  }

  to_xy(index) {
    return { x: index % this.cols, y: Math.floor(index / this.cols) };
  }
};
