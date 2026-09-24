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
 * @property {0|16|47|"dual"} [autotile] - 0: TileType.id as frame, 16: blob4, 47: blob8.
 *   "dual": a half-cell-offset grid whose transparent corners let lower terrain show through.
 * @property {number} [alpha]
 * @property {number} [color]
 * @property {number} [minId] - "dual" only: a cell counts as filled iff its TileType id is at least
 *   this, so ordered ids let one layer render as a cumulative material stack.
 * @property {number} [skipAbove] - "dual" only: skip a display tile the next material covers
 *   whole, so a stack costs about one grid's quads, not one per material.
 * @property {{r: number, g: number, b: number, time: function(): number}} [wave] - a flowing
 *   material's crest tone (0..1 floats), drifting on a sim clock so it freezes on pause. Lit only.
 */

/** @implements {RenderPass} */
globalThis.RenderTileMap = class RenderTileMap {
  /** `sprite` frame indices must match the autotile mode. */
  constructor(layer, grid, sprite, opt = {}) {
    this.enabled = true;
    this.layer = layer;
    this.grid = grid;
    this.sprite = sprite;
    this.alpha = opt.alpha ?? 1;
    this.color = opt.color ?? c_white;
    this._baked = -1; // the layer's `edits` at the last bake; -1 = never
    this._batch = new VertexBatch();
    this.lights = opt.lights; // unset = unlit
    this.wave = opt.wave;
    // 0 accepts any TileType, so a single-material dual layer is plain occupancy
    this.minId = opt.minId ?? 0;
    this.skipAbove = opt.skipAbove;

    const mode = opt.autotile ?? 0;
    this._dual = mode === "dual";
    if (mode === 16) {
      this._frameOf = (x, y) => this._blob4(x, y);
    } else if (mode === 47) {
      this._frameOf = (x, y) => this._blob8(x, y);
    } else if (mode === "dual") {
      this._frameOf = undefined; // dual has its own rebuild path
    } else {
      this._frameOf = (x, y) => {
        const t = layer.get(x, y);
        return t ? t.id : 0;
      };
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

  _rebuild() {
    this._baked = this.layer.edits;
    if (this._dual) {
      this._rebuildDual();
      return;
    }
    const { layer, grid, sprite } = this;
    const { cols, rows, cellWidth, cellHeight } = grid;

    this._batch.destroy();
    const batch = new VertexBatch().begin();
    this._batch = batch;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!layer.get(x, y)) continue;
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
    batch.end();
  }

  /** Dual grid: a display tile centered on each data-grid corner, its frame the corner mask. */
  _rebuildDual() {
    const { grid, sprite } = this;
    const { cols, rows, cellWidth, cellHeight } = grid;
    const hw = cellWidth * 0.5;
    const hh = cellHeight * 0.5;

    this._batch.destroy();
    const batch = new VertexBatch().begin();
    this._batch = batch;
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const mask = this._dualMask(i, j, this.minId);
        if (mask === 0) continue;
        if (this.skipAbove !== undefined && this._dualMask(i, j, this.skipAbove) === 15)
          continue;
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
    batch.end();
  }

  /**
   * Corner mask at corner point (i, j) for a material threshold: TL=1 TR=2 BR=4 BL=8. Off-grid
   * reads as empty, so a level edge fades out rather than tiling past itself.
   */
  _dualMask(i, j, minId) {
    let mask = 0;
    if (this._atLeast(i - 1, j - 1, minId)) mask |= 1;
    if (this._atLeast(i, j - 1, minId)) mask |= 2;
    if (this._atLeast(i, j, minId)) mask |= 4;
    if (this._atLeast(i - 1, j, minId)) mask |= 8;
    return mask;
  }

  _atLeast(x, y, minId) {
    const { cols, rows } = this.grid;
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
    const t = this.layer.get(x, y); // 0 when empty, not undefined
    return t ? t.id >= minId : false;
  }

  draw(entities) {
    if (this.layer.edits !== this._baked) this._rebuild();
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
    this._batch.submit();
    if (lit) shader_reset();
  }

  destroy() {
    this._batch.destroy();
  }
};
