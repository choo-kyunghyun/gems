const MARGIN = 2; // cells past the view's ground rect whose standing geometry can reach into it

/**
 * A layer's grid cut into square chunks, so a pass bakes, rebakes and draws one chunk at a time.
 * `sync` replays the layer's write log from its own cursor and marks every chunk a write can
 * reach — the written cell and its eight neighbours, since a pass's geometry reads them (an
 * autotile mask, a south face, a dual corner). The first sync, and one behind the log's reach,
 * mark every chunk. A pass bakes a stale chunk only once it is in view, so an edit off screen
 * costs nothing until the camera gets there.
 *
 * The chunks tile `cols + 1` × `rows + 1` slots, so a dual grid's far corner line has chunks too;
 * a cell pass clips a chunk's range to the grid.
 */
globalThis.Chunks = class Chunks {
  /**
   * @param {LevelGrid} grid
   * @param {LevelLayer} layer
   * @param {number} [size] slots per chunk side
   */
  constructor(grid, layer, size = 16) {
    this.layer = layer;
    this.size = size;
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.cellWidth = grid.cellWidth;
    this.cellHeight = grid.cellHeight;
    this.nx = Math.ceil((grid.cols + 1) / size);
    this.ny = Math.ceil((grid.rows + 1) / size);
    this.count = this.nx * this.ny;
    this.dirty = new Array(this.count).fill(1); // 1 = the chunk's bake is stale
    this._seen = -1; // the layer's edit count at the last sync; -1 = never
  }

  /** Marks the chunks the writes since the last sync reach. */
  sync() {
    const layer = this.layer;
    if (layer.edits === this._seen) return;
    const from = layer.since(this._seen);
    this._seen = layer.edits;
    const dirty = this.dirty;
    if (from < 0) {
      dirty.fill(1);
      return;
    }
    const log = layer.log;
    const cols = this.cols;
    const size = this.size;
    const nx = this.nx;
    for (let k = from; k < log.length; k++) {
      const i = log[k];
      const x = i % cols;
      const y = (i - x) / cols;
      // x + 1 is at most cols, still a slot, so only the low side clips
      const cx0 = Math.floor((x > 0 ? x - 1 : 0) / size);
      const cy0 = Math.floor((y > 0 ? y - 1 : 0) / size);
      const cx1 = Math.floor((x + 1) / size);
      const cy1 = Math.floor((y + 1) / size);
      for (let cy = cy0; cy <= cy1; cy++)
        for (let cx = cx0; cx <= cx1; cx++) dirty[cy * nx + cx] = 1;
    }
  }

  /**
   * The chunks a camera's view can reach, into `out` as chunk columns `x0..x1` and rows `y0..y1`
   * (`x0`/`y0` INCLUSIVE, `x1`/`y1` EXCLUSIVE); every chunk with no camera, or one not yet
   * sized. The view is its ground rect, padded so geometry standing on a cell just outside it
   * still draws. Returns `out`.
   */
  window(camera, out) {
    if (camera === undefined || !(camera.width > 0)) {
      out.x0 = 0;
      out.y0 = 0;
      out.x1 = this.nx;
      out.y1 = this.ny;
      return out;
    }
    const v = camera.groundRect();
    const size = this.size;
    const x0 = Math.floor((Math.floor(v.x1 / this.cellWidth) - MARGIN) / size);
    const y0 = Math.floor((Math.floor(v.y1 / this.cellHeight) - MARGIN) / size);
    const x1 = Math.floor((Math.floor(v.x2 / this.cellWidth) + MARGIN) / size) + 1;
    const y1 = Math.floor((Math.floor(v.y2 / this.cellHeight) + MARGIN) / size) + 1;
    out.x0 = x0 < 0 ? 0 : x0;
    out.y0 = y0 < 0 ? 0 : y0;
    out.x1 = x1 > this.nx ? this.nx : x1;
    out.y1 = y1 > this.ny ? this.ny : y1;
    return out;
  }

  /** Chunk `k`'s slot range into `out`: `x0`/`y0` INCLUSIVE, `x1`/`y1` EXCLUSIVE. Returns `out`. */
  bounds(k, out) {
    const size = this.size;
    const cx = k % this.nx;
    const cy = (k - cx) / this.nx;
    out.x0 = cx * size;
    out.y0 = cy * size;
    out.x1 = Math.min(out.x0 + size, this.cols + 1);
    out.y1 = Math.min(out.y0 + size, this.rows + 1);
    return out;
  }
};
