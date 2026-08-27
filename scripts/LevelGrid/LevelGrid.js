/**
 * @typedef {{ cost: number | undefined }} NavData
 */

/**
 * A layer's cell value is a `TileType` instance — id/name and the nav-cost rules live on the class.
 * @typedef {Object} LevelLayer
 * @property {function(number, number): TileType | undefined} get
 * @property {function(number, number, TileType | undefined): LevelLayer} set
 * @property {function(number, number): NavData} getNavData
 * @property {number} edits  count of cell writes so far (a consumer mirroring the layer diffs it)
 * @property {number[]} dirty  cell indexes written since the mirror last drained them
 * @property {boolean} dirtyAll  the writes outran `dirty` — the mirror resamples every cell
 * @property {function(): Object} export
 * @property {function(Object): void} import
 * @property {function(): void} destroy
 */

/**
 * Live pathfinding does NOT read the tile layers — NavGrid (colliders + tile costs) is the one nav
 * source; it mirrors `costAt` into its base whenever `edits` moves. `costAt` itself is on-demand
 * layer cost, for that mirror and for debug/inspection.
 */
globalThis.LevelGrid = class LevelGrid {
  constructor(opt = {}) {
    this.cellWidth = opt.cellWidth ?? 32;
    this.cellHeight = opt.cellHeight ?? 32;
    this.cols = opt.cols ?? Math.floor(room_width / this.cellWidth);
    this.rows = opt.rows ?? Math.floor(room_height / this.cellHeight);

    this.layers = [];

    // plain object — for...in is GMRT-safe, Map iteration is not
    this.zoneMaps = {};
  }

  addZoneMap(key, map = new ZoneMap(this.cols, this.rows)) {
    this.zoneMaps[key] = map;
    return map;
  }

  zoneMap(key) {
    return this.zoneMaps[key];
  }

  zoneAt(key, wx, wy) {
    const map = this.zoneMaps[key];
    if (map === undefined) return undefined;
    const g = this.worldToGrid(wx, wy);
    return map.at(g.x, g.y);
  }

  /** Top by default; higher index = higher nav priority. */
  insert(layer, index = this.layers.length) {
    this.layers.splice(index, 0, layer);
    return this;
  }

  remove(layer) {
    const i = this.layers.indexOf(layer);
    if (i >= 0) this.layers.splice(i, 1);
    return this;
  }

  /**
   * On-demand tile nav cost of a cell: topmost layer with a defined cost wins (higher index =
   * higher priority); no layer reporting → Infinity. Debug/inspection only (RenderDebugTileMap
   * shading) — live pathfinding reads NavGrid, never the tile layers.
   */
  costAt(x, y) {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const nav = this.layers[i].getNavData(x, y);
      if (nav.cost !== undefined) return nav.cost;
    }
    return Infinity;
  }

  /** Sum of the layers' edit counts — moves on any tile write, so a mirror knows to resample. */
  edits() {
    let n = 0;
    for (let i = 0; i < this.layers.length; i++) n += this.layers[i].edits;
    return n;
  }

  worldToGrid(wx, wy) {
    return {
      x: Math.floor(wx / this.cellWidth),
      y: Math.floor(wy / this.cellHeight),
    };
  }

  /** World coords of the cell's CENTER. */
  gridToWorld(gx, gy) {
    return {
      x: gx * this.cellWidth + this.cellWidth * 0.5,
      y: gy * this.cellHeight + this.cellHeight * 0.5,
    };
  }

  /**
   * The cell window a camera can see, clamped to the grid: `x0`/`y0` INCLUSIVE, `x1`/`y1`
   * EXCLUSIVE — cells iterate `x0 <= x < x1`, and the cell BOUNDARY lines at `x0..x1` (inclusive)
   * are the ones bounding them, which is what a line drawer wants. `camera` is optional: with none,
   * or before one is sized (`width > 0` dodges the first-frame NaN rect), the whole grid is the
   * window. The rect is Camera.groundRect — never camera_get_view_* (it returns 0 for the
   * matrix-driven Camera) — and groundRect owns the pitch stretch, so a tilted view still gets the
   * cells at the top and bottom of the screen.
   */
  viewRange(camera) {
    if (camera === undefined || !(camera.width > 0))
      return { x0: 0, y0: 0, x1: this.cols, y1: this.rows };
    const view = camera.groundRect();
    return {
      x0: Math.max(0, Math.floor(view.x1 / this.cellWidth)),
      y0: Math.max(0, Math.floor(view.y1 / this.cellHeight)),
      x1: Math.min(this.cols, Math.ceil(view.x2 / this.cellWidth)),
      y1: Math.min(this.rows, Math.ceil(view.y2 / this.cellHeight)),
    };
  }

  /**
   * The tile layers' cells as one binary buffer — the dense half of a level save (the JSON half
   * is what a cell can't say: which TileType an id means, and the zone channels' registries).
   * Layout, little-endian: u32 cols, u32 rows, u32 layer count, then per layer in `layers` order
   * cols×rows u16 TileType ids row-major (0 = empty). Returns the buffer; the caller owns it.
   */
  pack() {
    const cols = this.cols;
    const rows = this.rows;
    const n = this.layers.length;
    const buf = buffer_create(12 + n * cols * rows * 2, buffer_fixed, 1);
    buffer_write(buf, buffer_u32, cols);
    buffer_write(buf, buffer_u32, rows);
    buffer_write(buf, buffer_u32, n);
    for (let l = 0; l < n; l++) {
      const layer = this.layers[l];
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const t = layer.get(x, y);
          buffer_write(buf, buffer_u16, t ? t.id : 0);
        }
    }
    return buf;
  }

  /**
   * Fill the tile layers from a pack() buffer. `typeOf(layerIndex, id)` maps a cell's stored id
   * back to the TileType the layer holds (an unknown id → undefined leaves the cell empty, and is
   * counted in the error the caller sees). The buffer must describe this grid — same cols/rows
   * and layer count — else nothing is written and false is returned (Log.error'd). The buffer
   * stays the caller's to free.
   */
  unpack(buf, typeOf) {
    buffer_seek(buf, buffer_seek_start, 0);
    const cols = buffer_read(buf, buffer_u32);
    const rows = buffer_read(buf, buffer_u32);
    const n = buffer_read(buf, buffer_u32);
    if (cols !== this.cols || rows !== this.rows || n !== this.layers.length) {
      Log.error(
        `LevelGrid.unpack: buffer is ${cols}x${rows}/${n} layer(s), grid is ` +
          `${this.cols}x${this.rows}/${this.layers.length}`,
      );
      return false;
    }
    let unknown = 0;
    for (let l = 0; l < n; l++) {
      const layer = this.layers[l];
      for (let y = 0; y < rows; y++)
        for (let x = 0; x < cols; x++) {
          const id = buffer_read(buf, buffer_u16);
          if (id === 0) continue;
          const t = typeOf(l, id);
          if (t === undefined) unknown++;
          else layer.set(x, y, t);
        }
    }
    if (unknown > 0)
      Log.error(
        `LevelGrid.unpack: ${unknown} cell(s) name a TileType id no layer knows`,
      );
    return true;
  }

  export() {
    const data = {
      cellWidth: this.cellWidth,
      cellHeight: this.cellHeight,
      cols: this.cols,
      rows: this.rows,
      layers: this.layers.map((layer) => layer.export()),
    };
    // omit zoneMaps when absent so existing saved levels are unaffected
    const keys = Object.keys(this.zoneMaps);
    if (keys.length > 0) {
      const zoneMaps = {};
      for (let i = 0; i < keys.length; i++) {
        zoneMaps[keys[i]] = this.zoneMaps[keys[i]].export();
      }
      data.zoneMaps = zoneMaps;
    }
    return data;
  }

  import(data) {
    for (let i = 0; i < this.layers.length; i++) {
      if (data.layers[i] !== undefined) {
        this.layers[i].import(data.layers[i]);
      }
    }
    if (data.zoneMaps !== undefined) {
      const keys = Object.keys(data.zoneMaps);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const map = this.zoneMaps[key] ?? this.addZoneMap(key);
        map.import(data.zoneMaps[key]);
      }
    }
    return this;
  }

  destroy() {
    for (const layer of this.layers) {
      layer.destroy();
    }
    const keys = Object.keys(this.zoneMaps);
    for (let i = 0; i < keys.length; i++) {
      this.zoneMaps[keys[i]].destroy();
    }
    this.zoneMaps = {};
    this.layers = [];
  }
};
