globalThis.MotionPlanningGrid = class MotionPlanningGrid {
  constructor(width, height) {
    this.cols = width;
    this.rows = height;
    this.data = new Float32Array(width * height).fill(1);
  }

  destroy() {
    this.data = undefined;
  }

  export() {
    return {
      width: this.cols,
      height: this.rows,
      data: Array.from(this.data),
    };
  }

  static import(snapshot) {
    const mpg = new MotionPlanningGrid(snapshot.width, snapshot.height);
    mpg.data.set(snapshot.data);
    return mpg;
  }

  width() {
    return this.cols;
  }

  height() {
    return this.rows;
  }

  size() {
    return this.cols * this.rows;
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

  clear(value = 1) {
    this.data.fill(value);
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
