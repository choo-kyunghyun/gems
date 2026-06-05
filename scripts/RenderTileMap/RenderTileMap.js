// Blob8 autotile lookup table (256 entries → 0-46 frame index).
// Bit layout: N=1, E=2, S=4, W=8, NE=16, SE=32, SW=64, NW=128.
// Corner bits are only counted when both adjacent cardinals are set; the 47
// unique normalized bitmasks are numbered in first-appearance order over masks
// 0-255. Precomputed as a literal: GMRT's interpreter fails to bind the scope
// of functions nested inside a top-level IIFE, so this can't be built at load.
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
 * @property {0|16|47} [autotile] - 0: use TileType.id as frame, 16: blob4, 47: blob8
 * @property {number} [alpha]
 * @property {number} [color]
 * @property {boolean} [softEdge] - per-vertex alpha blending at tile boundaries (RimWorld style)
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
    if (mode === 16) {
      this._frameOf = (x, y) => this._blob4(x, y);
    } else if (mode === 47) {
      this._frameOf = (x, y) => this._blob8(x, y);
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

  _blob4(x, y) {
    let mask = 0;
    if (this._isSolid(x, y - 1)) mask |= 1;
    if (this._isSolid(x + 1, y)) mask |= 2;
    if (this._isSolid(x, y + 1)) mask |= 4;
    if (this._isSolid(x - 1, y)) mask |= 8;
    return mask;
  }

  _blob8(x, y) {
    const north = this._isSolid(x, y - 1);
    const east  = this._isSolid(x + 1, y);
    const south = this._isSolid(x, y + 1);
    const west  = this._isSolid(x - 1, y);
    let mask = (north ? 1 : 0) | (east ? 2 : 0) | (south ? 4 : 0) | (west ? 8 : 0);
    if (north && east  && this._isSolid(x + 1, y - 1)) mask |= 16;
    if (south && east  && this._isSolid(x + 1, y + 1)) mask |= 32;
    if (south && west  && this._isSolid(x - 1, y + 1)) mask |= 64;
    if (north && west  && this._isSolid(x - 1, y - 1)) mask |= 128;
    return _BLOB8[mask];
  }

  _rebuild() {
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
        const uvs = sprite_get_uvs(sprite, frame);
        const wx = x * cellWidth;
        const wy = y * cellHeight;
        if (this.softEdge) {
          this._vbuf.addQuadV(
            wx, wy, cellWidth, cellHeight,
            uvs[0], uvs[1], uvs[2], uvs[3],
            this.color,
            this._cornerAlpha(x, y, -1, -1),
            this._cornerAlpha(x, y,  1, -1),
            this._cornerAlpha(x, y, -1,  1),
            this._cornerAlpha(x, y,  1,  1),
          );
        } else {
          this._vbuf.addQuad(
            wx, wy, cellWidth, cellHeight,
            uvs[0], uvs[1], uvs[2], uvs[3],
            this.color, this.alpha,
          );
        }
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
