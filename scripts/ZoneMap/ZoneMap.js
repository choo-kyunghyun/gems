const OPEN = -2; // an open cell no flood has reached yet

/**
 * A cell grid split into the zones its blocked cells close off. A cell is OUTSIDE (0) when the
 * border reaches it through open cells, a zone (≥ 1) when blocked cells cut it off, BLOCKED (-1)
 * when blocked itself. Open cells join by edge only, so a diagonal gap closes a zone.
 * `zones[id]` is `{ id, first, cells }`; `first`, the zone's lowest cell index, is a stable
 * handle while the zone keeps that cell and gains none below it.
 *
 * The map is derived, never edited: `label` re-derives it whole, one flood fill per call.
 */
globalThis.ZoneMap = class ZoneMap {
  constructor(cols, rows, cellWidth, cellHeight) {
    this.cols = cols;
    this.rows = rows;
    this.cellWidth = cellWidth;
    this.cellHeight = cellHeight;
    this.grid = new Grid(cols, rows);
    this.zones = [{ id: 0, first: -1, cells: 0 }];
    this._rects = null; // rects() cache, dropped by a label
    this._queue = [];
  }

  destroy() {
    this.grid.destroy();
    this.grid = undefined;
  }

  /**
   * A cell is blocked where `blocked(x, y)` holds or a `rects` entry ([gx, gy, w, h], clipped to
   * the grid) covers it. `blocked` is asked about every cell once.
   */
  label(blocked, rects = []) {
    this._rects = null;
    const cols = this.cols;
    const rows = this.rows;
    const d = this.grid.data;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        d[y * cols + x] = blocked(x, y) ? ZoneMap.BLOCKED : OPEN;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const x0 = Math.max(r[0], 0);
      const y0 = Math.max(r[1], 0);
      const x1 = Math.min(r[0] + r[2], cols);
      const y1 = Math.min(r[1] + r[3], rows);
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) d[y * cols + x] = ZoneMap.BLOCKED;
    }

    const zones = this.zones;
    zones.length = 1;
    zones[0].cells = 0;
    for (let x = 0; x < cols; x++) {
      this._flood(x, 0);
      this._flood(x, rows - 1);
    }
    for (let y = 1; y < rows - 1; y++) {
      this._flood(0, y);
      this._flood(cols - 1, y);
    }
    for (let i = 0; i < d.length; i++) {
      if (d[i] !== OPEN) continue;
      zones.push({ id: zones.length, first: i, cells: 0 });
      this._flood(i % cols, Math.floor(i / cols));
    }
  }

  /** Off-grid reads outside. */
  at(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows)
      return ZoneMap.OUTSIDE;
    return this.grid.data[gy * this.cols + gx];
  }

  atWorld(wx, wy) {
    return this.at(
      Math.floor(wx / this.cellWidth),
      Math.floor(wy / this.cellHeight),
    );
  }

  /** The zones as the fewest world-px rects (x2/y2 exclusive), cached until the next label. */
  rects() {
    if (this._rects !== null) return this._rects;
    const d = this.grid.data;
    const cols = this.cols;
    const cw = this.cellWidth;
    const ch = this.cellHeight;
    const cells = Grid.meshRects(cols, this.rows, (x, y) => d[y * cols + x] > 0);
    const out = [];
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      out.push({
        x1: c[0] * cw,
        y1: c[1] * ch,
        x2: (c[0] + c[2]) * cw,
        y2: (c[1] + c[3]) * ch,
      });
    }
    this._rects = out;
    return out;
  }

  /** Floods with the id of the last zone pushed. */
  _flood(gx, gy) {
    const cols = this.cols;
    const rows = this.rows;
    const d = this.grid.data;
    const start = gy * cols + gx;
    if (d[start] !== OPEN) return;
    const zone = this.zones[this.zones.length - 1];
    const id = zone.id;
    const q = this._queue;
    let head = 0;
    let tail = 0;
    q[tail++] = start;
    d[start] = id;
    while (head < tail) {
      const i = q[head++];
      zone.cells++;
      const x = i % cols;
      const y = (i - x) / cols;
      if (x > 0 && d[i - 1] === OPEN) {
        d[i - 1] = id;
        q[tail++] = i - 1;
      }
      if (x < cols - 1 && d[i + 1] === OPEN) {
        d[i + 1] = id;
        q[tail++] = i + 1;
      }
      if (y > 0 && d[i - cols] === OPEN) {
        d[i - cols] = id;
        q[tail++] = i - cols;
      }
      if (y < rows - 1 && d[i + cols] === OPEN) {
        d[i + cols] = id;
        q[tail++] = i + cols;
      }
    }
    q.length = 0;
  }
};
ZoneMap.OUTSIDE = 0;
ZoneMap.BLOCKED = -1;
