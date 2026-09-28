const TILE = 32; // `tsMask`'s tile side (px)

/**
 * A level's blocking cells as a runtime tile map, so a move meets a wall cell the way it meets a
 * `Solid`. A cell blocks when any layer holds a type whose `pathCost` blocks, and the ring one
 * cell outside the grid blocks too, so nothing leaves the level. The map spans the ring on a
 * hidden layer of its own, and `mask` is its JS twin, one byte per map cell, which `walk` reads:
 * the runtime reports a tile map crossed but never which cell.
 *
 * `sync` replays the layers' edit logs from its own cursor. The map's cell is the tile set's,
 * so a grid of another cell size throws; a level with no grid has no map, and `against` — what a
 * move collides with — is `Solid` alone.
 */
globalThis.SolidTiles = class SolidTiles {
  /** @param {LevelGrid|null} tiles the grid this map mirrors */
  constructor(tiles) {
    this.tiles = tiles;
    this.against = Solid;
    this.layer = -1;
    this.map = undefined;
    this.cols = 0; // the map's, the ring included
    this.rows = 0;
    this.mask = undefined;
    this._cursor = new EditCursor(); // where the mask was sampled in the layers' logs
    if (tiles === null) return;
    if (tiles.cellWidth !== TILE || tiles.cellHeight !== TILE)
      throw new Error(
        `SolidTiles: a ${tiles.cellWidth}x${tiles.cellHeight} cell is not the tile set's ${TILE}x${TILE}`,
      );
    this.cols = tiles.cols + 2;
    this.rows = tiles.rows + 2;
    this.mask = new Uint8Array(this.cols * this.rows);
    this.layer = layer_create(0);
    layer_set_visible(this.layer, false);
    this.map = layer_tilemap_create(this.layer, -TILE, -TILE, tsMask, this.cols, this.rows);
    this.against = [Solid, this.map];
    for (let i = 0; i < this.cols; i++) {
      this._write(i, 0, 1);
      this._write(i, this.rows - 1, 1);
    }
    for (let j = 1; j < this.rows - 1; j++) {
      this._write(0, j, 1);
      this._write(this.cols - 1, j, 1);
    }
    this.sync();
  }

  destroy() {
    if (this.layer !== -1) layer_destroy(this.layer); // the map with it
    this.layer = -1;
    this.map = undefined;
    this.mask = undefined;
    this.tiles = undefined;
  }

  /** Whether grid cell (gx, gy) blocks; the ring does, and anything past it does not. */
  at(gx, gy) {
    const i = gx + 1;
    const j = gy + 1;
    if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) return false;
    return this.mask[j * this.cols + i] === 1;
  }

  /**
   * Re-derive the cells the layers wrote since the last sync — every cell on the first, after a
   * bulk paint, or when the layer stack changed. Returns whether it resampled.
   */
  sync() {
    const tiles = this.tiles;
    if (tiles === null) return false;
    const layers = tiles.layers;
    const cursor = this._cursor;
    const state = cursor.poll(layers);
    if (state === 0) return false;

    // every layer spans the grid, so a layer's cell index is the grid's
    const cols = tiles.cols;
    if (state < 0) {
      for (let y = 0; y < tiles.rows; y++)
        for (let x = 0; x < cols; x++) this._write(x + 1, y + 1, this._blocks(y * cols + x));
    } else {
      const from = cursor.from;
      for (let i = 0; i < layers.length; i++) {
        const log = layers[i].log;
        for (let k = from[i]; k < log.length; k++) {
          const idx = log[k];
          this._write((idx % cols) + 1, Math.floor(idx / cols) + 1, this._blocks(idx));
        }
      }
    }
    return true;
  }

  /**
   * Where (x0,y0)->(x1,y1) enters a blocking run, cell by cell: `out` takes a `t, nx, ny` triple
   * per entry in order of `t` — the first alone when `first` — the normal pointing back along the
   * ray, `t` 0 when the start is inside. Returns the entry count.
   */
  walk(x0, y0, x1, y1, first, out) {
    out.length = 0;
    const mask = this.mask;
    if (mask === undefined) return 0;
    // the runtime answers whether, in one call, so only a crossing ray pays the walk; a miss is
    // the number -4, a hit the map's handle (docs/GMRT.md)
    const hit = PuppetSystem.probe().collision_line(x0, y0, x1, y1, this.map, false, true);
    if (typeof hit === "number") return 0;
    const cols = this.cols;
    const rows = this.rows;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const fx = (x0 + TILE) / TILE; // map-cell units
    const fy = (y0 + TILE) / TILE;
    // a start on a cell edge belongs to the cell the ray moves into
    let i = dx < 0 ? Math.ceil(fx) - 1 : Math.floor(fx);
    let j = dy < 0 ? Math.ceil(fy) - 1 : Math.floor(fy);
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const tdx = dx !== 0 ? TILE / Math.abs(dx) : Infinity;
    const tdy = dy !== 0 ? TILE / Math.abs(dy) : Infinity;
    let tx = dx > 0 ? (i + 1 - fx) * tdx : dx < 0 ? (fx - i) * tdx : Infinity;
    let ty = dy > 0 ? (j + 1 - fy) * tdy : dy < 0 ? (fy - j) * tdy : Infinity;
    // off the map nothing blocks
    let inside = i >= 0 && j >= 0 && i < cols && j < rows ? mask[j * cols + i] === 1 : false;
    if (inside) {
      const xAxis = Math.abs(dx) >= Math.abs(dy);
      out.push(0, xAxis ? -stepX : 0, xAxis ? 0 : -stepY);
      if (first) return 1;
    }
    while (true) {
      let t;
      let nx = 0;
      let ny = 0;
      if (tx < ty) {
        t = tx;
        i += stepX;
        tx += tdx;
        nx = -stepX;
      } else {
        t = ty;
        j += stepY;
        ty += tdy;
        ny = -stepY;
      }
      if (t > 1) break;
      const s = i >= 0 && j >= 0 && i < cols && j < rows ? mask[j * cols + i] === 1 : false;
      if (s) if (!inside) {
        out.push(t, nx, ny);
        if (first) break;
      }
      inside = s;
    }
    return out.length / 3;
  }

  /** Whether any layer's type at grid cell `idx` blocks, as 1 or 0. */
  _blocks(idx) {
    const layers = this.tiles.layers;
    for (let i = 0; i < layers.length; i++) {
      const id = layers[i].ids.data[idx];
      if (id !== 0) if (layers[i].types[id].pathCost === Infinity) return 1;
    }
    return 0;
  }

  /** The map cell's value, into the runtime only when it changed. */
  _write(i, j, v) {
    const k = j * this.cols + i;
    if (this.mask[k] === v) return;
    this.mask[k] = v;
    tilemap_set(this.map, v, i, j);
  }
};
