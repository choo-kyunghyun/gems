// blob8 autotile table (256 → 0-46 frame). N=1 E=2 S=4 W=8 NE=16 SE=32 SW=64 NW=128.
// corner bits only count when both adjacent cardinals are set.
// BUG: a precomputed literal, as GMRT can't bind closures nested in a top-level IIFE.
const _BLOB8 = [
   0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15,
   0,  1,  2, 16,  4,  5,  6, 17,  8,  9, 10, 18, 12, 13, 14, 19,
   0,  1,  2,  3,  4,  5, 20, 21,  8,  9, 10, 11, 12, 13, 22, 23,
   0,  1,  2, 16,  4,  5, 20, 24,  8,  9, 10, 18, 12, 13, 22, 25,
   0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 26, 27, 28, 29,
   0,  1,  2, 16,  4,  5,  6, 17,  8,  9, 10, 18, 26, 27, 28, 30,
   0,  1,  2,  3,  4,  5, 20, 21,  8,  9, 10, 11, 26, 27, 31, 32,
   0,  1,  2, 16,  4,  5, 20, 24,  8,  9, 10, 18, 26, 27, 31, 33,
   0,  1,  2,  3,  4,  5,  6,  7,  8, 34, 10, 35, 12, 36, 14, 37,
   0,  1,  2, 16,  4,  5,  6, 17,  8, 34, 10, 38, 12, 36, 14, 39,
   0,  1,  2,  3,  4,  5, 20, 21,  8, 34, 10, 35, 12, 36, 22, 40,
   0,  1,  2, 16,  4,  5, 20, 24,  8, 34, 10, 38, 12, 36, 22, 41,
   0,  1,  2,  3,  4,  5,  6,  7,  8, 34, 10, 35, 26, 42, 28, 43,
   0,  1,  2, 16,  4,  5,  6, 17,  8, 34, 10, 38, 26, 42, 28, 44,
   0,  1,  2,  3,  4,  5, 20, 21,  8, 34, 10, 35, 26, 42, 31, 45,
   0,  1,  2, 16,  4,  5, 20, 24,  8, 34, 10, 38, 26, 42, 31, 46,
];

/**
 * @typedef {Object} RenderTileMapOptions
 * @property {0|16|47|"dual"} [autotile] - 0: `frame` on every cell, 16: blob4, 47: blob8.
 *   "dual": a half-cell-offset grid whose transparent corners let lower terrain show through.
 * @property {number} [frame] - 0 only: the one frame drawn (default 0)
 * @property {number} [match] - not "dual": draw only the cells whose TileType id is this, so one
 *   pass per material draws a many-material layer; the autotile still reads the whole layer's
 *   occupancy (default: every occupied cell)
 * @property {View} [camera] - draw and bake only the chunks its view reaches (default: all)
 * @property {number} [alpha]
 * @property {number} [color]
 * @property {number} [minId] - "dual" only: a cell counts as filled iff its TileType id is at least
 *   this, so ordered ids let one layer render as a cumulative material stack.
 * @property {number} [skipAbove] - "dual" only: skip a display tile the next material covers
 *   whole, so a stack costs about one grid's quads, not one per material.
 * @property {{r: number, g: number, b: number, time: function(): number}} [wave] - a flowing
 *   material's crest tone (0..1 floats), drifting on a sim clock so it freezes on pause. Lit only.
 */

/**
 * Bakes the layer into one vertex batch per chunk (`Chunks`), so a write rebakes only the chunks
 * it reaches, once they are in view.
 * @implements {RenderPass}
 */
globalThis.RenderTileMap = class RenderTileMap {
  /** `sprite` frame indices must match the autotile mode. */
  constructor(layer, grid, sprite, opt = {}) {
    this.enabled = true;
    this.layer = layer;
    this.grid = grid;
    this.sprite = sprite;
    this.alpha = opt.alpha ?? 1;
    this.color = opt.color ?? c_white;
    this._chunks = new Chunks(grid, layer);
    this._batches = new Array(this._chunks.count); // per chunk; undefined where it drew nothing
    this._range = { x0: 0, y0: 0, x1: 0, y1: 0 }; // the chunk being baked
    this._win = { x0: 0, y0: 0, x1: 0, y1: 0 }; // the chunks in view this frame
    this._fill = []; // per palette index, 1 when a cell counts as filled; rebuilt per dual bake
    this._cover = []; // per palette index, 1 when the next material covers a cell
    this.camera = opt.camera;
    this.lights = opt.lights; // unset = unlit
    this.wave = opt.wave;
    // 0 accepts any TileType, so a single-material dual layer is plain occupancy
    this.minId = opt.minId ?? 0;
    this.skipAbove = opt.skipAbove;
    this.match = opt.match;

    const mode = opt.autotile ?? 0;
    this._dual = mode === "dual";
    if (mode === 16) {
      this._frameOf = (x, y) => this._blob4(x, y);
    } else if (mode === 47) {
      this._frameOf = (x, y) => this._blob8(x, y);
    } else if (mode === "dual") {
      this._frameOf = undefined; // dual has its own rebuild path
    } else {
      const frame = opt.frame ?? 0;
      this._frameOf = (x, y) => frame;
    }
  }

  _isSolid(x, y) {
    const { cols, rows } = this.grid;
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
    return !!this.layer.get(x, y);
  }

  _blob4(x, y) {
    let mask = 0;
    if (this._isSolid(x, y - 1)) mask |= 1;
    if (this._isSolid(x + 1, y)) mask |= 2;
    if (this._isSolid(x, y + 1)) mask |= 4;
    if (this._isSolid(x - 1, y)) mask |= 8;
    return mask;
  }

  _blob8(x, y) {
    // BUG: #15549 — no cached bool locals, so diagonals read the cardinals back off the mask
    // bits (docs/GMRT.md)
    let mask = 0;
    if (this._isSolid(x, y - 1)) mask |= 1;
    if (this._isSolid(x + 1, y)) mask |= 2;
    if (this._isSolid(x, y + 1)) mask |= 4;
    if (this._isSolid(x - 1, y)) mask |= 8;
    if (mask & 1 && mask & 2 && this._isSolid(x + 1, y - 1)) mask |= 16;
    if (mask & 4 && mask & 2 && this._isSolid(x + 1, y + 1)) mask |= 32;
    if (mask & 4 && mask & 8 && this._isSolid(x - 1, y + 1)) mask |= 64;
    if (mask & 1 && mask & 8 && this._isSolid(x - 1, y - 1)) mask |= 128;
    return _BLOB8[mask];
  }

  /** Rebakes chunk `k`. */
  _bake(k) {
    this._chunks.dirty[k] = 0;
    const batches = this._batches;
    if (batches[k] !== undefined) batches[k].destroy();
    const batch = new VertexBatch().begin();
    const r = this._chunks.bounds(k, this._range);
    if (this._dual) this._bakeDual(batch, r);
    else this._bakeCells(batch, r);
    batch.end();
    if (batch.count === 0) {
      batch.destroy();
      batches[k] = undefined;
    } else batches[k] = batch;
  }

  _bakeCells(batch, r) {
    const { layer, grid, sprite } = this;
    const { cols, rows, cellWidth, cellHeight } = grid;
    const match = this.match;
    const x1 = r.x1 < cols ? r.x1 : cols;
    const y1 = r.y1 < rows ? r.y1 : rows;
    for (let y = r.y0; y < y1; y++) {
      for (let x = r.x0; x < x1; x++) {
        const t = layer.get(x, y);
        if (!t) continue;
        if (match !== undefined) if (t.id !== match) continue;
        batch.addFrame(
          sprite,
          this._frameOf(x, y),
          x * cellWidth,
          y * cellHeight,
          cellWidth,
          cellHeight,
          this.color,
          this.alpha,
        );
      }
    }
  }

  /**
   * Dual grid: a display tile centered on each data-grid corner, its frame the corner mask of the
   * four cells around it (TL=1 TR=2 BR=4 BL=8) — a cell counting when its TileType id is at least
   * `minId`, and off-grid reading empty so a level edge fades out rather than tiling past itself.
   * The cells are read off the layer's palette indexes, never a call per corner.
   */
  _bakeDual(batch, r) {
    const { layer, grid, sprite } = this;
    const { cols, rows, cellWidth, cellHeight } = grid;
    const hw = cellWidth * 0.5;
    const hh = cellHeight * 0.5;
    const d = layer.ids.data;
    const types = layer.types;
    const minId = this.minId;
    const skip = this.skipAbove;
    const fill = this._fill;
    const cover = this._cover;
    fill.length = types.length;
    cover.length = types.length;
    fill[0] = 0;
    cover[0] = 0;
    for (let p = 1; p < types.length; p++) {
      fill[p] = types[p].id >= minId ? 1 : 0;
      cover[p] = skip !== undefined ? (types[p].id >= skip ? 1 : 0) : 0;
    }
    for (let j = r.y0; j < r.y1; j++) {
      const up = (j - 1) * cols;
      const dn = j * cols;
      for (let i = r.x0; i < r.x1; i++) {
        const tl = i > 0 ? (j > 0 ? d[up + i - 1] : 0) : 0;
        const tr = i < cols ? (j > 0 ? d[up + i] : 0) : 0;
        const br = i < cols ? (j < rows ? d[dn + i] : 0) : 0;
        const bl = i > 0 ? (j < rows ? d[dn + i - 1] : 0) : 0;
        let mask = 0;
        if (fill[tl] === 1) mask |= 1;
        if (fill[tr] === 1) mask |= 2;
        if (fill[br] === 1) mask |= 4;
        if (fill[bl] === 1) mask |= 8;
        if (mask === 0) continue;
        if (cover[tl] + cover[tr] + cover[br] + cover[bl] === 4) continue;
        batch.addFrame(
          sprite,
          mask,
          i * cellWidth - hw,
          j * cellHeight - hh,
          cellWidth,
          cellHeight,
          this.color,
          this.alpha,
        );
      }
    }
  }

  draw(entities) {
    const chunks = this._chunks;
    chunks.sync();
    const w = chunks.window(this.camera, this._win);
    const dirty = chunks.dirty;
    const nx = chunks.nx;
    for (let cy = w.y0; cy < w.y1; cy++)
      for (let cx = w.x0; cx < w.x1; cx++) if (dirty[cy * nx + cx] === 1) this._bake(cy * nx + cx);
    // lit as flat ground (normal straight up); z-write stays off, so only the shading changes

    const lit = this.lights !== undefined && this.lights.litOk;
    if (lit) {
      this.lights.setupLights(entities);
      shader_set_uniform_f(this.lights.uUseTex, 1);
      shader_set_uniform_f(this.lights.uNormal, 0, 0, -1);
      const wave = this.wave;
      if (wave !== undefined) {
        shader_set_uniform_f(this.lights.uWave, 1);
        shader_set_uniform_f(this.lights.uWaveColor, wave.r, wave.g, wave.b);
        shader_set_uniform_f(this.lights.uTime, wave.time());
      }
    }
    const batches = this._batches;
    for (let cy = w.y0; cy < w.y1; cy++)
      for (let cx = w.x0; cx < w.x1; cx++) {
        const b = batches[cy * nx + cx];
        if (b !== undefined) b.submit();
      }
    if (lit) shader_reset();
  }

  destroy() {
    const batches = this._batches;
    for (let k = 0; k < batches.length; k++)
      if (batches[k] !== undefined) batches[k].destroy();
    this._batches = [];
  }
};
