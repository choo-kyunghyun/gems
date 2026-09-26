const OPEN = -2; // an open cell no flood has reached yet

/**
 * A level's cells split into the zones its blocked cells close off. A cell is OUTSIDE (0) when the
 * border reaches it through open cells, a zone (≥ 1) when blocked cells cut it off, BLOCKED (-1)
 * when blocked itself. Open cells join by edge only, so a diagonal gap closes a zone.
 * `zones[id]` is `{ id, first, cells }`; `first`, the zone's lowest cell index, is a stable
 * handle while the zone keeps that cell and gains none below it.
 *
 * The map is derived, never edited: `label` re-derives it whole, one flood fill per call.
 */
globalThis.ZoneMap = class ZoneMap {
  /** @param {LevelGrid} tiles the level whose cells this map splits */
  constructor(tiles) {
    this.tiles = tiles;
    this.grid = tiles.alloc();
    this.zones = [{ id: 0, first: -1, cells: 0 }];
    this._zoned = null; // cells() cache, dropped by a label
    this._queue = [];
    this._cells = { x0: 0, y0: 0, x1: 0, y1: 0 }; // a rect's cell range, reused per label
  }

  destroy() {
    this.grid.destroy();
    this.grid = undefined;
    this.tiles = undefined;
  }

  /**
   * A cell is blocked where `blocked(x, y)` holds or a `rects` entry (world px, x2/y2 exclusive)
   * covers it. `blocked` is asked about every cell once.
   */
  label(blocked, rects = []) {
    this._zoned = null;
    const tiles = this.tiles;
    const cols = tiles.cols;
    const rows = tiles.rows;
    const d = this.grid.data;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        d[y * cols + x] = blocked(x, y) ? ZoneMap.BLOCKED : OPEN;
    const c = this._cells;
    for (let i = 0; i < rects.length; i++) {
      tiles.cellRect(rects[i], c);
      for (let y = c.y0; y < c.y1; y++)
        for (let x = c.x0; x < c.x1; x++) d[y * cols + x] = ZoneMap.BLOCKED;
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
    const tiles = this.tiles;
    if (gx < 0 || gy < 0 || gx >= tiles.cols || gy >= tiles.rows)
      return ZoneMap.OUTSIDE;
    return this.grid.data[gy * tiles.cols + gx];
  }

  atWorld(wx, wy) {
    const i = this.tiles.cellAt(wx, wy);
    return i < 0 ? ZoneMap.OUTSIDE : this.grid.data[i];
  }

  /** Every zone's cell indices, ascending, cached until the next label. */
  cells() {
    if (this._zoned !== null) return this._zoned;
    const d = this.grid.data;
    const out = [];
    for (let i = 0; i < d.length; i++) if (d[i] > 0) out.push(i);
    this._zoned = out;
    return out;
  }

  /** Floods with the id of the last zone pushed. */
  _flood(gx, gy) {
    const cols = this.tiles.cols;
    const rows = this.tiles.rows;
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
