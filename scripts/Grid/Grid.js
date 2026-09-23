/**
 * Row-major cell grid. `data` is public so a bulk consumer can walk it without a call per cell;
 * single-cell access goes through get/set. clear() fills in place, so a held `data` reference
 * stays valid across it.
 */
globalThis.Grid = class Grid {
  constructor(cols, rows) {
    this.rows = rows;
    this.cols = cols;
    this.data = Array(this.size()).fill(0);
  }

  destroy() {
    this.data = undefined;
  }

  export() {
    return {
      cols: this.cols,
      rows: this.rows,
      data: this.data.slice(),
    };
  }

  static import(data) {
    const grid = new Grid(data.cols, data.rows);
    grid.data = data.data;
    return grid;
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
    this.data.fill(value);
    return this;
  }

  /** No bounds check — guard with inBounds. */
  set(x, y, value) {
    this.data[this.toIndex(x, y)] = value;
    return this;
  }

  get(x, y) {
    return this.data[this.toIndex(x, y)];
  }

  /**
   * Greedy-meshes a solid/empty field into the fewest [gx, gy, wCells, hCells] rects, since
   * per-cell colliders leave seams that snag the resolver. Predicate-driven because the field need
   * not be a Grid. `isSolid(x, y)` is asked only about in-bounds cells, repeatedly, so it must be
   * a cheap read.
   */
  static meshRects(cols, rows, isSolid) {
    const consumed = new Array(cols * rows).fill(false);
    const avail = (x, y) =>
      x < cols && y < rows && isSolid(x, y) && !consumed[y * cols + x];

    const rects = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!avail(x, y)) continue;

        let w = 1;
        while (avail(x + w, y)) w++;

        let h = 1;
        for (let grow = true; grow; h++) {
          for (let k = 0; k < w; k++)
            if (!avail(x + k, y + h)) {
              grow = false;
              break;
            }
        }
        h--; // the last iteration incremented past the failed row

        for (let yy = y; yy < y + h; yy++)
          for (let xx = x; xx < x + w; xx++) consumed[yy * cols + xx] = true;

        rects.push([x, y, w, h]);
      }
    }
    return rects;
  }
};
