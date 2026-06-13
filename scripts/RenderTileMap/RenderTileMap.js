// Blob8 autotile lookup table (256 entries → 0-46 frame index).
// Bit layout: N=1, E=2, S=4, W=8, NE=16, SE=32, SW=64, NW=128.
// Corner bits are only counted when both adjacent cardinals are set; the 47
// unique normalized bitmasks are numbered in first-appearance order over masks
// 0-255. Precomputed as a literal: GMRT's interpreter fails to bind the scope
// of functions nested inside a top-level IIFE, so this can't be built at load.
// prettier-ignore
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
 * @property {0|16|47|"dual"} [autotile] - 0: use TileType.id as frame, 16: blob4, 47: blob8,
 *   "dual": dual-grid corner sampling (16-frame, half-cell offset). The blob modes draw one
 *   tile per filled cell against empty; "dual" samples the 4 cells touching each grid corner,
 *   so a tile's empty corners stay transparent — stack several dual passes (one TileLayer per
 *   terrain) in priority order to get RPG-Maker-style A-over-B transitions.
 * @property {number} [alpha]
 * @property {number} [color]
 * @property {boolean} [softEdge] - per-vertex alpha blending at tile boundaries (RimWorld style).
 *   Per-cell modes only; ignored for "dual" (its corner art already carries the edge transparency).
 */

/** @implements {RenderPass} */
globalThis.RenderTileMap = class RenderTileMap {
  /**
   * @param {import("../TileLayer/TileLayer").TileLayer} layer
   * @param {import("../Level/Level").Level} level
   * @param {number} sprite - tileset sprite; frame indices must match the autotile mode
   * @param {RenderTileMapOptions} [opt]
   */
  constructor(layer, level, sprite, opt = {}) {
    this.enabled = true;
    this.layer = layer;
    this.level = level;
    this.sprite = sprite;
    this.alpha = opt.alpha ?? 1;
    this.color = opt.color ?? c_white;
    this.softEdge = opt.softEdge ?? false;
    this.dirty = true;
    this._vbuf = new VertexBuffer();
    this._tex = undefined;

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
    const { cols, rows } = this.level;
    if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
    return !!this.layer.get(x, y);
  }

  // Out-of-bounds is treated as solid so map edges don't produce soft edges.
  _isSolidOrOOB(x, y) {
    const { cols, rows } = this.level;
    if (x < 0 || y < 0 || x >= cols || y >= rows) return true;
    return !!this.layer.get(x, y);
  }

  _cornerAlpha(x, y, dx, dy) {
    return this._isSolidOrOOB(x + dx, y) &&
      this._isSolidOrOOB(x, y + dy) &&
      this._isSolidOrOOB(x + dx, y + dy)
      ? 1
      : 0;
  }

  // sprite_get_uvs returns trim metadata in [4..7]: the texture packer crops each
  // frame's transparent border, so the UV rect [0..3] covers only the opaque region.
  // Honour the offset/size factors so a trimmed quad isn't stretched to fill the cell
  // (which rendered border vs interior tiles at different sizes). When a frame isn't
  // trimmed, offsets are 0 and ratios 1, so this reduces to the full-cell quad.
  // Returns [x, y, w, h, u0, v0, u1, v1].
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
    // GMRT miscompiles cached primitive-bool locals (south "not defined" at
    // runtime) — test _isSolid inline like _blob4 and read cardinals back off
    // the mask bits for the diagonal checks (N=1, E=2, S=4, W=8).
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
    const { layer, level, sprite } = this;
    const { cols, rows, cellWidth, cellHeight } = level;

    this._vbuf.destroy();
    this._vbuf = new VertexBuffer();
    this._tex = sprite_get_texture(sprite, 0);

    this._vbuf.begin();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!layer.get(x, y)) continue;
        const frame = this._frameOf(x, y);
        const q = this._quad(frame, x * cellWidth, y * cellHeight, cellWidth, cellHeight);
        if (this.softEdge) {
          this._vbuf.addQuadV(
            q[0],
            q[1],
            q[2],
            q[3],
            q[4],
            q[5],
            q[6],
            q[7],
            this.color,
            this._cornerAlpha(x, y, -1, -1),
            this._cornerAlpha(x, y, 1, -1),
            this._cornerAlpha(x, y, -1, 1),
            this._cornerAlpha(x, y, 1, 1),
          );
        } else {
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
    }
    this._vbuf.end();
    this.dirty = false;
  }

  // Dual-grid: the display grid is offset by half a cell so each display tile is
  // centered on a data-grid corner and covers the 4 cells touching that corner.
  // Corner bits: TL=1, TR=2, BR=4, BL=8 → frame index = mask (0-15, like blob4).
  // Empty corners read transparent in the art, so stacking dual passes per terrain
  // (lower terrain first) shows the lower one through the upper one's borders.
  _rebuildDual() {
    const { level, sprite } = this;
    const { cols, rows, cellWidth, cellHeight } = level;
    const hw = cellWidth * 0.5;
    const hh = cellHeight * 0.5;

    this._vbuf.destroy();
    this._vbuf = new VertexBuffer();
    this._tex = sprite_get_texture(sprite, 0);

    this._vbuf.begin();
    // Corner points run 0..cols and 0..rows inclusive (one extra row/col of tiles).
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        let mask = 0;
        if (this._isSolid(i - 1, j - 1)) mask |= 1; // TL
        if (this._isSolid(i, j - 1)) mask |= 2; // TR
        if (this._isSolid(i, j)) mask |= 4; // BR
        if (this._isSolid(i - 1, j)) mask |= 8; // BL
        if (mask === 0) continue;
        const q = this._quad(mask, i * cellWidth - hw, j * cellHeight - hh, cellWidth, cellHeight);
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

  draw(_world) {
    if (this.dirty) this._rebuild();
    this._vbuf.submit(this._tex);
  }

  destroy() {
    this._vbuf.destroy();
  }
};
