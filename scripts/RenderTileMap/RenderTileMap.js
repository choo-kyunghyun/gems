// blob8 autotile table (256 → 0-46 frame). N=1 E=2 S=4 W=8 NE=16 SE=32 SW=64 NW=128.
// corner bits only count when both adjacent cardinals are set.
// precomputed literal — GMRT can't bind closures nested in a top-level IIFE.
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
 *   "dual": half-cell-offset grid; samples 4 cells per display corner (TL=1 TR=2 BR=4 BL=8 →
 *   frame); transparent corners let lower terrain show through — stack dual passes per terrain
 *   for RPG-Maker-style A-over-B transitions.
 * @property {number} [alpha]
 * @property {number} [color]
 * @property {number} [minId] - "dual" only: a cell counts as filled iff its TileType id is at least
 *   this. Ordered ids make ONE layer render as a cumulative material stack — pass m takes
 *   minId = m + 1 — instead of one layer per material (the terrain palette, see ColonyLevel).
 * @property {number} [skipAbove] - "dual" only: skip a display tile the NEXT material covers whole
 *   (its mask at this threshold is 15). Without it every lower material draws its full extent
 *   under the ones above it; with it a stack costs about one grid's quads, not one per material.
 * @property {{r: number, g: number, b: number, time: function(): number}} [wave] - a FLOWING
 *   material (water): shMeshlit's wave mode paints crest bands in this tone (0..1 floats) over
 *   the sheet, drifting on `time()` — a SIM clock, so they freeze on pause. Lit maps only.
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
    this.dirty = true;
    this._vbuf = new VertexBuffer();
    this._tex = undefined;
    this.lights = opt.lights; // host RenderMesh pass → lit ground (see draw); unset = unlit
    // a flowing material: { r, g, b, time } — crest tone (0..1 floats) + the clock the crests
    // drift on (a SIM clock, so they freeze on pause); lit maps only, unset = still ground
    this.wave = opt.wave;
    // "dual" material-stack options (see the typedef); minId 0 accepts any TileType, so an
    // ordinary single-material dual layer behaves exactly as plain occupancy.
    this.minId = opt.minId ?? 0;
    this.skipAbove = opt.skipAbove;

    const mode = opt.autotile ?? 0;
    this._dual = mode === "dual";
    if (mode === 16) {
      this._frameOf = (x, y) => this._blob4(x, y);
    } else if (mode === 47) {
      this._frameOf = (x, y) => this._blob8(x, y);
    } else if (mode === "dual") {
      this._frameOf = undefined; // dual uses its own rebuild path, not _frameOf
    } else {
      this._frameOf = (x, y) => {
        const t = layer.get(x, y);
        return t ? t.id : 0;
      };
    }
  }

  markDirty() {
    this.dirty = true;
    return this;
  }

  _isSolid(x, y) {
    const { cols, rows } = this.grid;
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
    return !!this.layer.get(x, y);
  }

  /**
   * honour sprite_get_uvs trim data [4..7] so texture-packer-cropped frames don't stretch to fill
   * the cell. untrimmed frames have offsets=0 ratios=1, reducing to a full-cell quad.
   * returns [x, y, w, h, u0, v0, u1, v1].
   */
  _quad(frame, wx, wy, cw, ch) {
    const uvs = sprite_get_uvs(this.sprite, frame);
    const sw = sprite_get_width(this.sprite);
    const sh = sprite_get_height(this.sprite);
    return [
      wx + uvs[4] * (cw / sw),
      wy + uvs[5] * (ch / sh),
      cw * uvs[6],
      ch * uvs[7],
      uvs[0],
      uvs[1],
      uvs[2],
      uvs[3],
    ];
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
    // BUG: [#15549] test _isSolid inline (no cached bool locals) and read
    // cardinals back off the mask bits for diagonal checks (N=1 E=2 S=4 W=8).
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
    if (this._dual) {
      this._rebuildDual();
      return;
    }
    const { layer, grid, sprite } = this;
    const { cols, rows, cellWidth, cellHeight } = grid;

    this._vbuf.destroy();
    this._vbuf = new VertexBuffer();
    this._tex = sprite_get_texture(sprite, 0);

    this._vbuf.begin();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!layer.get(x, y)) continue;
        const frame = this._frameOf(x, y);
        const q = this._quad(
          frame,
          x * cellWidth,
          y * cellHeight,
          cellWidth,
          cellHeight,
        );
        this._vbuf.addQuad(
          q[0],
          q[1],
          q[2],
          q[3],
          q[4],
          q[5],
          q[6],
          q[7],
          this.color,
          this.alpha,
        );
      }
    }
    this._vbuf.end();
    this.dirty = false;
  }

  /**
   * dual-grid: display tile centered on each data-grid corner, sampling 4 touching cells.
   * TL=1 TR=2 BR=4 BL=8 → frame = mask. transparent corners let lower terrain show through.
   */
  _rebuildDual() {
    const { grid, sprite } = this;
    const { cols, rows, cellWidth, cellHeight } = grid;
    const hw = cellWidth * 0.5;
    const hh = cellHeight * 0.5;

    this._vbuf.destroy();
    this._vbuf = new VertexBuffer();
    this._tex = sprite_get_texture(sprite, 0);

    this._vbuf.begin();
    // one extra row/col of corner points (0..cols and 0..rows inclusive)
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const mask = this._dualMask(i, j, this.minId);
        if (mask === 0) continue;
        // fully hidden by the material stacked above → no quad at all
        if (this.skipAbove !== undefined && this._dualMask(i, j, this.skipAbove) === 15)
          continue;
        const q = this._quad(
          mask,
          i * cellWidth - hw,
          j * cellHeight - hh,
          cellWidth,
          cellHeight,
        );
        this._vbuf.addQuad(
          q[0],
          q[1],
          q[2],
          q[3],
          q[4],
          q[5],
          q[6],
          q[7],
          this.color,
          this.alpha,
        );
      }
    }
    this._vbuf.end();
    this.dirty = false;
  }

  /**
   * dual corner mask at corner point (i, j) for a material threshold: TL=1 TR=2 BR=4 BL=8. OOB
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
    const t = this.layer.get(x, y); // Grid.get returns 0 for empty, not undefined
    return t ? t.id >= minId : false;
  }

  draw(entities) {
    if (this.dirty) this._rebuild();
    // GROUND under the one lit shader: `lights` (the host RenderMesh pass, assigned by the
    // level on pitched maps) supplies the shared sun/point gather; the normal is straight up
    // — flat ground. z-write stays off (painter order), so only the shading changes; unset
    // (flat maps / editor) submits fixed-function unlit exactly as before.
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
    this._vbuf.submit(this._tex);
    if (lit) shader_reset();
  }

  destroy() {
    this._vbuf.destroy();
  }
};
