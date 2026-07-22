// blob8 autotile table (256 → 0-46 frame). N=1 E=2 S=4 W=8 NE=16 SE=32 SW=64 NW=128.
// corner bits only count when both adjacent cardinals are set.
// precomputed literal — GMRT can't bind closures nested in a top-level IIFE.
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
 * @property {0|16|47|"dual"|"corner"} [autotile] - 0: TileType.id as frame, 16: blob4, 47: blob8.
 *   "dual": half-cell-offset grid; samples 4 cells per display corner (TL=1 TR=2 BR=4 BL=8 →
 *   frame); transparent corners let lower terrain show through — stack dual passes per terrain
 *   for RPG-Maker-style A-over-B transitions. This path draws `frame = mask` flat: the weighted
 *   full-tile variant pick for mask 15 lives only in TerrainStream — add it here too if a
 *   variant-bearing sheet ever gets a RenderTileMap consumer.
 *   "corner": sub-tile; each filled cell drawn as 4 half-cell quads from a 13-piece sprite picked
 *   by the 3 neighbors at that corner (0 fill, 1-4 outer TL/TR/BR/BL, 5-6 edge top/bottom,
 *   7-8 edge left/right, 9-12 inner TL/TR/BR/BL). covers all 256 masks without _BLOB8.
 * @property {number} [alpha]
 * @property {number} [color]
 * @property {boolean} [softEdge] - per-vertex alpha at tile edges; per-cell modes only, ignored for "dual".
 */

/** @implements {RenderPass} */
globalThis.RenderTileMap = class RenderTileMap {
  /**
   * @param {import("../TileLayer/TileLayer").TileLayer} layer
   * @param {LevelGrid} grid
   * @param {number} sprite - tileset sprite; frame indices must match the autotile mode
   * @param {RenderTileMapOptions} [opt]
   */
  constructor(layer, grid, sprite, opt = {}) {
    this.enabled = true;
    this.layer = layer;
    this.grid = grid;
    this.sprite = sprite;
    this.alpha = opt.alpha ?? 1;
    this.color = opt.color ?? c_white;
    this.softEdge = opt.softEdge ?? false;
    this.dirty = true;
    this._vbuf = new VertexBuffer();
    this._tex = undefined;
    this.lights = opt.lights; // host RenderMesh pass → lit ground (see draw); unset = unlit

    const mode = opt.autotile ?? 0;
    this._dual = mode === "dual";
    this._corner = mode === "corner";
    if (mode === 16) {
      this._frameOf = (x, y) => this._blob4(x, y);
    } else if (mode === 47) {
      this._frameOf = (x, y) => this._blob8(x, y);
    } else if (mode === "dual" || mode === "corner") {
      this._frameOf = undefined; // dual/corner use their own rebuild path, not _frameOf
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

  // OOB counts as solid so map edges don't produce soft-edge bleeds
  _isSolidOrOOB(x, y) {
    const { cols, rows } = this.grid;
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

  // honour sprite_get_uvs trim data [4..7] so texture-packer-cropped frames don't stretch to fill
  // the cell. untrimmed frames have offsets=0 ratios=1, reducing to a full-cell quad.
  // returns [x, y, w, h, u0, v0, u1, v1].
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
    // GMRT miscompiles cached primitive-bool locals — test _isSolid inline and read
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
    if (this._corner) {
      this._rebuildCorner();
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

  // dual-grid: display tile centered on each data-grid corner, sampling 4 touching cells.
  // TL=1 TR=2 BR=4 BL=8 → frame = mask. transparent corners let lower terrain show through.
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
        let mask = 0;
        if (this._isSolid(i - 1, j - 1)) mask |= 1; // TL
        if (this._isSolid(i, j - 1)) mask |= 2; // TR
        if (this._isSolid(i, j)) mask |= 4; // BR
        if (this._isSolid(i - 1, j)) mask |= 8; // BL
        if (mask === 0) continue;
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

  // corner sub-tile: each filled cell as 4 half-cell quads, each piece picked by 3 neighbors.
  // 13-piece set covers all 256 masks without _BLOB8. N=1 E=2 S=4 W=8 NE=16 SE=32 SW=64 NW=128.
  _rebuildCorner() {
    const { layer, grid, sprite } = this;
    const { cols, rows, cellWidth, cellHeight } = grid;
    const hw = cellWidth * 0.5;
    const hh = cellHeight * 0.5;

    this._vbuf.destroy();
    this._vbuf = new VertexBuffer();
    this._tex = sprite_get_texture(sprite, 0);

    this._vbuf.begin();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!layer.get(x, y)) continue;
        // one int mask of all 8 neighbors — no cached bool locals (GMRT miscompiles; see _blob8)
        let m = 0;
        if (this._isSolid(x, y - 1)) m |= 1;
        if (this._isSolid(x + 1, y)) m |= 2;
        if (this._isSolid(x, y + 1)) m |= 4;
        if (this._isSolid(x - 1, y)) m |= 8;
        if (this._isSolid(x + 1, y - 1)) m |= 16;
        if (this._isSolid(x + 1, y + 1)) m |= 32;
        if (this._isSolid(x - 1, y + 1)) m |= 64;
        if (this._isSolid(x - 1, y - 1)) m |= 128;
        const wx = x * cellWidth;
        const wy = y * cellHeight;
        this._addCorner(this._cornerTL(m), wx, wy, hw, hh);
        this._addCorner(this._cornerTR(m), wx + hw, wy, hw, hh);
        this._addCorner(this._cornerBR(m), wx + hw, wy + hh, hw, hh);
        this._addCorner(this._cornerBL(m), wx, wy + hh, hw, hh);
      }
    }
    this._vbuf.end();
    this.dirty = false;
  }

  _addCorner(frame, qx, qy, qw, qh) {
    const q = this._quad(frame, qx, qy, qw, qh);
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

  // per corner: both cardinals empty → outer, one → edge, both with diagonal empty → inner, all → fill.
  // bits read INLINE each test (no `const N = m&1`) — GMRT miscompiles cached bool locals (flipped the
  // inner-corner branch in-engine). See _blob8.
  _cornerTL(m) {
    if (!(m & 1) && !(m & 8)) return 1; // N,W empty → outer
    if (m & 1 && !(m & 8)) return 7; // N solid → left edge
    if (!(m & 1) && m & 8) return 5; // W solid → top edge
    return m & 128 ? 0 : 9; // NW solid → fill, else inner
  }
  _cornerTR(m) {
    if (!(m & 1) && !(m & 2)) return 2;
    if (m & 1 && !(m & 2)) return 8;
    if (!(m & 1) && m & 2) return 5;
    return m & 16 ? 0 : 10;
  }
  _cornerBR(m) {
    if (!(m & 4) && !(m & 2)) return 3;
    if (m & 4 && !(m & 2)) return 8;
    if (!(m & 4) && m & 2) return 6;
    return m & 32 ? 0 : 11;
  }
  _cornerBL(m) {
    if (!(m & 4) && !(m & 8)) return 4;
    if (m & 4 && !(m & 8)) return 7;
    if (!(m & 4) && m & 8) return 6;
    return m & 64 ? 0 : 12;
  }

  draw(entities) {
    if (this.dirty) this._rebuild();
    // GROUND under the one lit shader: `lights` (the host RenderMesh pass, assigned by the
    // level on pitched maps) supplies the shared sun/point gather; the normal is straight up
    // — flat ground. z-write stays off (painter order), so only the shading changes; unset
    // (kit default / flat maps / editor) submits fixed-function unlit exactly as before.
    const lit = this.lights !== undefined && this.lights._litOk;
    if (lit) {
      this.lights._setupLights(entities);
      shader_set_uniform_f(this.lights._uUseTex, 1);
      shader_set_uniform_f(this.lights._uNormal, 0, 0, -1);
    }
    this._vbuf.submit(this._tex);
    if (lit) shader_reset();
  }

  destroy() {
    this._vbuf.destroy();
  }
};
