/**
 * The level-sized room grid, one cell per level cell, derived from where the walls close. A cell
 * is OUTSIDE (0) when the map border reaches it through open cells, a room (≥ 1) when the walls
 * cut it off, WALL (-1) when a bounding layer occupies it or a stamped footprint covers it.
 * `rooms[id]` is `{ id, first, cells }`; `first`, the room's lowest cell index, is the stable
 * handle a per-room record keys by, surviving any wall edit that leaves that cell in place.
 *
 * Two sources, each with its own refresh: the bounding layers' edit counters (`sync`) and the
 * stamped footprints (`stamp`), so a doorway closes a room whether its leaf is open or shut.
 * A derivation is one whole-level flood fill, paid on a change only, never per frame.
 */
globalThis.Rooms = class Rooms {
  /**
   * @param {LevelGrid} tiles
   * @param {LevelLayer[]} layers the layers whose occupied cells bound a room
   */
  constructor(tiles, layers) {
    this.tiles = tiles;
    this.layers = layers;
    this.cols = tiles.cols;
    this.rows = tiles.rows;
    this.cellW = tiles.cellWidth;
    this.cellH = tiles.cellHeight;
    this.grid = new Grid(this.cols, this.rows);
    this.rooms = [{ id: 0, first: -1, cells: 0 }];
    this._edits = -1; // the layers' summed edits the grid was derived at; -1 = never
    this._stamps = []; // own copies, world px, x2/y2 exclusive
    this._roofs = null; // rects() cache, dropped by a derivation
    this._queue = [];
  }

  destroy() {
    this.grid.destroy();
    this.grid = undefined;
    this.tiles = undefined;
    this.layers = undefined;
  }

  /** Returns whether it re-derived. */
  sync() {
    let edits = 0;
    for (let i = 0; i < this.layers.length; i++) edits += this.layers[i].edits;
    if (edits === this._edits) return false;
    this._edits = edits;
    this._derive();
    return true;
  }

  /**
   * Compared by value, so a caller may hand the same scratch every frame. Returns whether it
   * re-derived.
   */
  stamp(rects) {
    const held = this._stamps;
    let same = held.length === rects.length;
    if (same) {
      for (let i = 0; i < rects.length; i++) {
        const a = held[i];
        const b = rects[i];
        if (a.x1 !== b.x1 || a.y1 !== b.y1 || a.x2 !== b.x2 || a.y2 !== b.y2) {
          same = false;
          break;
        }
      }
    }
    if (same) return false;
    held.length = 0;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      held.push({ x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 });
    }
    if (this._edits !== -1) this._derive(); // else the first sync derives with these
    return true;
  }

  /** Off-grid reads outside. */
  at(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) return 0;
    return this.grid.data[gy * this.cols + gx];
  }

  atWorld(wx, wy) {
    return this.at(Math.floor(wx / this.cellW), Math.floor(wy / this.cellH));
  }

  /** The rooms as the fewest world-px rects (x2/y2 exclusive), cached until the next derivation. */
  rects() {
    if (this._roofs !== null) return this._roofs;
    const d = this.grid.data;
    const cols = this.cols;
    const cw = this.cellW;
    const ch = this.cellH;
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
    this._roofs = out;
    return out;
  }

  _derive() {
    this._roofs = null;
    const cols = this.cols;
    const rows = this.rows;
    const d = this.grid.data;
    const layers = this.layers;
    // -2 = unvisited open cell; -1 = wall
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        let wall = false;
        for (let i = 0; i < layers.length; i++)
          if (layers[i].get(x, y)) wall = true; // 0 = empty
        d[y * cols + x] = wall ? -1 : -2;
      }
    const rects = this._stamps;
    const cw = this.cellW;
    const ch = this.cellH;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      // inclusive cell range: x2/y2 are exclusive edges
      let gx0 = Math.floor(r.x1 / cw);
      let gy0 = Math.floor(r.y1 / ch);
      let gx1 = Math.floor((r.x2 - 1) / cw);
      let gy1 = Math.floor((r.y2 - 1) / ch);
      if (gx0 < 0) gx0 = 0;
      if (gy0 < 0) gy0 = 0;
      if (gx1 > cols - 1) gx1 = cols - 1;
      if (gy1 > rows - 1) gy1 = rows - 1;
      for (let gy = gy0; gy <= gy1; gy++)
        for (let gx = gx0; gx <= gx1; gx++) d[gy * cols + gx] = -1;
    }

    const rooms = this.rooms;
    rooms.length = 1;
    rooms[0].cells = 0;
    for (let x = 0; x < cols; x++) {
      this._flood(x, 0);
      this._flood(x, rows - 1);
    }
    for (let y = 1; y < rows - 1; y++) {
      this._flood(0, y);
      this._flood(cols - 1, y);
    }
    for (let i = 0; i < d.length; i++) {
      if (d[i] !== -2) continue;
      rooms.push({ id: rooms.length, first: i, cells: 0 });
      this._flood(i % cols, Math.floor(i / cols));
    }
  }

  /** Floods with the id of the last room pushed. */
  _flood(gx, gy) {
    const cols = this.cols;
    const rows = this.rows;
    const d = this.grid.data;
    const start = gy * cols + gx;
    if (d[start] !== -2) return;
    const room = this.rooms[this.rooms.length - 1];
    const id = room.id;
    const q = this._queue;
    let head = 0;
    let tail = 0;
    q[tail++] = start;
    d[start] = id;
    while (head < tail) {
      const i = q[head++];
      room.cells++;
      const x = i % cols;
      const y = (i - x) / cols;
      if (x > 0 && d[i - 1] === -2) {
        d[i - 1] = id;
        q[tail++] = i - 1;
      }
      if (x < cols - 1 && d[i + 1] === -2) {
        d[i + 1] = id;
        q[tail++] = i + 1;
      }
      if (y > 0 && d[i - cols] === -2) {
        d[i - cols] = id;
        q[tail++] = i - cols;
      }
      if (y < rows - 1 && d[i + cols] === -2) {
        d[i + cols] = id;
        q[tail++] = i + cols;
      }
    }
    q.length = 0;
  }
};
Rooms.OUTSIDE = 0;
Rooms.WALL = -1;
