/**
 * Row-major cell grid. `data` is public so a bulk consumer can walk it without a call per cell;
 * single-cell access goes through get/set. clear() fills in place, so a held `data` reference
 * stays valid across it.
 */
globalThis.Grid = class Grid {
  constructor(cols, rows) {
    this.rows = rows;
    this.cols = cols;
    this.data = Array(rows * cols).fill(0);
  }

  destroy() {
    this.data = undefined;
  }

  clear(value) {
    this.data.fill(value);
    return this;
  }

  /** No bounds check. */
  set(x, y, value) {
    this.data[y * this.cols + x] = value;
    return this;
  }

  get(x, y) {
    return this.data[y * this.cols + x];
  }

  /** The cells, row-major, as `type` values (a `buffer_*` constant) at the buffer's position. */
  write(buf, type) {
    const d = this.data;
    for (let i = 0; i < d.length; i++) buffer_write(buf, type, d[i]);
  }

  /** Fills every cell from `write`'s layout at the buffer's position. */
  read(buf, type) {
    const d = this.data;
    for (let i = 0; i < d.length; i++) d[i] = buffer_read(buf, type);
  }
};
