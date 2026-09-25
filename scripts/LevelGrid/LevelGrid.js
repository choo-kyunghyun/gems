/**
 * A layer's cell value is a `TileType` instance.
 * @typedef {Object} LevelLayer
 * @property {number} cols
 * @property {number} rows
 * @property {function(number, number): TileType | undefined} get
 * @property {function(number, number, TileType | undefined): LevelLayer} set
 * @property {function(number, number): number | undefined} costAt  the cell's nav cost; undefined passes through to the layer below
 * @property {number} edits  count of cell writes so far; a mirror diffs it
 * @property {number[]} dirty  cell indexes written since the mirror last drained them
 * @property {boolean} dirtyAll  the writes outran `dirty` — the mirror resamples every cell
 * @property {function(): void} destroy
 */

/**
 * A level's cell grid and its stacked tile layers — the one owner of the level's shape. Every
 * layer spans the grid and every level-sized array is minted by `alloc`, so a cell index means the
 * same cell in each. Live pathfinding never reads the layers: the nav source mirrors `costAt`
 * whenever `edits` moves.
 */
globalThis.LevelGrid = class LevelGrid {
  constructor(opt = {}) {
    this.cellWidth = opt.cellWidth ?? 32;
    this.cellHeight = opt.cellHeight ?? 32;
    this.cols = opt.cols ?? Math.floor(room_width / this.cellWidth);
    this.rows = opt.rows ?? Math.floor(room_height / this.cellHeight);
    this.size = this.cols * this.rows;

    this.layers = [];
  }

  /** A fresh level-sized `Grid`, every cell `fill`. */
  alloc(fill = 0) {
    const g = new Grid(this.cols, this.rows);
    if (fill !== 0) g.clear(fill);
    return g;
  }

  /**
   * Top by default; higher index = higher nav priority. Throws on a layer that doesn't span the
   * grid.
   */
  insert(layer, index = this.layers.length) {
    if (layer.cols !== this.cols || layer.rows !== this.rows)
      throw new Error(
        `LevelGrid.insert: layer is ${layer.cols}x${layer.rows}, grid is ${this.cols}x${this.rows}`,
      );
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
   * higher priority); no layer reporting → Infinity. For mirroring and inspection, never live
   * pathfinding.
   */
  costAt(x, y) {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const cost = this.layers[i].costAt(x, y);
      if (cost !== undefined) return cost;
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

  /** The index of the cell under a world point; -1 off the grid. */
  cellAt(wx, wy) {
    const gx = Math.floor(wx / this.cellWidth);
    const gy = Math.floor(wy / this.cellHeight);
    if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) return -1;
    return gy * this.cols + gx;
  }

  /**
   * The cells a world-px rect covers (`x2`/`y2` exclusive, so the last cell is the one holding
   * `x2 - 1`), clipped to the grid, written into `out` as `x0`/`y0` INCLUSIVE, `x1`/`y1`
   * EXCLUSIVE; a rect off the grid leaves `x0 >= x1` or `y0 >= y1`. Returns `out`.
   */
  cellRect(rect, out) {
    const cw = this.cellWidth;
    const ch = this.cellHeight;
    const x0 = Math.floor(rect.x1 / cw);
    const y0 = Math.floor(rect.y1 / ch);
    const x1 = Math.floor((rect.x2 - 1) / cw) + 1;
    const y1 = Math.floor((rect.y2 - 1) / ch) + 1;
    out.x0 = x0 < 0 ? 0 : x0;
    out.y0 = y0 < 0 ? 0 : y0;
    out.x1 = x1 > this.cols ? this.cols : x1;
    out.y1 = y1 > this.rows ? this.rows : y1;
    return out;
  }

  /**
   * The cell window a view record can see, clamped to the grid: `x0`/`y0` INCLUSIVE, `x1`/`y1`
   * EXCLUSIVE — cells iterate `x0 <= x < x1`, and the cell BOUNDARY lines at `x0..x1` (inclusive)
   * are the ones bounding them, which is what a line drawer wants. With no camera, or before one
   * is sized (`width > 0` dodges the first-frame NaN rect), the whole grid is the window. The
   * rect is the view's ground rect — never camera_get_view_*, which returns 0 for a matrix-driven
   * camera.
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
   * is what a cell can't say: which TileType an id means).
   * Layout, little-endian: u32 cols, u32 rows, u32 cellWidth, u32 cellHeight, u32 layer count,
   * then per layer in `layers` order cols×rows u16 TileType ids row-major (0 = empty). Returns
   * the buffer; the caller owns it.
   */
  pack() {
    const cols = this.cols;
    const rows = this.rows;
    const n = this.layers.length;
    const buf = buffer_create(20 + n * cols * rows * 2, buffer_fixed, 1);
    buffer_write(buf, buffer_u32, cols);
    buffer_write(buf, buffer_u32, rows);
    buffer_write(buf, buffer_u32, this.cellWidth);
    buffer_write(buf, buffer_u32, this.cellHeight);
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

  /** A pack() buffer's header — { cols, rows, cellWidth, cellHeight, layers } — the shape to
   *  build the grid that unpacks it. */
  static shape(buf) {
    buffer_seek(buf, buffer_seek_start, 0);
    const cols = buffer_read(buf, buffer_u32);
    const rows = buffer_read(buf, buffer_u32);
    const cellWidth = buffer_read(buf, buffer_u32);
    const cellHeight = buffer_read(buf, buffer_u32);
    const layers = buffer_read(buf, buffer_u32);
    return { cols, rows, cellWidth, cellHeight, layers };
  }

  /**
   * Fill the tile layers from a pack() buffer. `typeOf(layerIndex, id)` maps a cell's stored id
   * back to the TileType the layer holds (an unknown id → undefined leaves the cell empty and is
   * logged). The buffer must describe this grid — same cols/rows and layer count — else nothing
   * is written and false is returned. The buffer stays the caller's to free.
   */
  unpack(buf, typeOf) {
    buffer_seek(buf, buffer_seek_start, 0);
    const cols = buffer_read(buf, buffer_u32);
    const rows = buffer_read(buf, buffer_u32);
    buffer_read(buf, buffer_u32); // cellWidth — the grid's own
    buffer_read(buf, buffer_u32); // cellHeight
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

  destroy() {
    for (const layer of this.layers) {
      layer.destroy();
    }
    this.layers = [];
  }
};
