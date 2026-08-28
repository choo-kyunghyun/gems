/**
 * The level-sized ROOM grid every enclosure consumer shares, one cell per LevelGrid cell — the
 * derived mirror of where the map's walls close. A cell is OUTSIDE (0) when the map border reaches
 * it through non-wall cells, a ROOM (≥ 1) when the walls cut it off from the border, WALL (-1) when
 * a bounding layer occupies it or a stamped footprint covers it. `grid` is the plain Grid a
 * consumer reads (`at`/`atWorld`); `rooms[id]` — `{ id, first, cells }` — describes each region,
 * `first` its lowest cell index in scan order: the stable handle a per-room record keys by (a
 * wall edit that leaves a room's top-left cell in place keeps its record; anything else is a new
 * room). `rooms[0]` is the outside.
 *
 * Two sources, each with its own refresh signal, like NavGrid: the bounding tile layers (their
 * `edits` counters — `sync` re-derives when one moves) and the stamped footprints (`stamp` — the
 * cells a door stands in, so a doorway closes a room whether the leaf is open or shut; which
 * entities those are is the consumer's call). A derivation is one whole-level flood fill, paid on
 * a change only, never per frame.
 */
globalThis.Rooms = class Rooms {
  /**
   * @param {LevelGrid} tiles the level this grid mirrors (dims, cell size)
   * @param {LevelLayer[]} layers the layers whose occupied cells bound a room (the wall layer —
   *   a fence bounds nothing, it has no roof)
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
    this._rects = []; // the stamped footprints ({x1,y1,x2,y2} world px, x2/y2 exclusive), own copies
    this._queue = []; // flood-fill scratch, kept across derivations
  }

  destroy() {
    this.grid.destroy();
    this.grid = undefined;
    this.tiles = undefined;
    this.layers = undefined;
  }

  /** Re-derive when a bounding layer has been edited since the last derivation. Returns whether it did. */
  sync() {
    let edits = 0;
    for (let i = 0; i < this.layers.length; i++) edits += this.layers[i].edits;
    if (edits === this._edits) return false;
    this._edits = edits;
    this._derive();
    return true;
  }

  /**
   * Take `rects` as the stamped footprints and re-derive — only when they differ from the held set
   * (compared by value, so a caller may hand the same scratch every frame). Returns whether it did.
   */
  stamp(rects) {
    const held = this._rects;
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

  /** Room id of a cell — 0 outside, ≥ 1 a room, -1 a wall; off-grid reads outside. */
  at(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) return 0;
    return this.grid.data[gy * this.cols + gx];
  }

  atWorld(wx, wy) {
    return this.at(Math.floor(wx / this.cellW), Math.floor(wy / this.cellH));
  }

  /**
   * Walls from the layers and the stamped rects, then the outside flooded from every border
   * cell, then each pocket left over as a room in scan order.
   */
  _derive() {
    const cols = this.cols;
    const rows = this.rows;
    const d = this.grid.data;
    const layers = this.layers;
    // -2 = unvisited open cell; -1 = wall
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        let wall = false;
        for (let i = 0; i < layers.length; i++)
          if (layers[i].get(x, y)) wall = true; // occupancy, as TileEdit reads it (0 = empty)
        d[y * cols + x] = wall ? -1 : -2;
      }
    const rects = this._rects;
    const cw = this.cellW;
    const ch = this.cellH;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      // inclusive cell range (x2/y2 are exclusive edges, so -1), clipped to the level
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
    // the outside: everything the border reaches
    for (let x = 0; x < cols; x++) {
      this._flood(x, 0);
      this._flood(x, rows - 1);
    }
    for (let y = 1; y < rows - 1; y++) {
      this._flood(0, y);
      this._flood(cols - 1, y);
    }
    // the rooms: every open pocket left, in scan order
    for (let i = 0; i < d.length; i++) {
      if (d[i] !== -2) continue;
      rooms.push({ id: rooms.length, first: i, cells: 0 });
      this._flood(i % cols, Math.floor(i / cols));
    }
  }

  /** Flood the unvisited region at a cell with the id of the room being laid down (the last one). */
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
