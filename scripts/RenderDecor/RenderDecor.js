/**
 * DECOR pass — identity pieces strewn over a tile layer by material. For every cell whose
 * TileType id a def names — and whose 4-neighbours share it, so a piece never lands on a
 * dual-grid transition — a position hash decides whether a piece lands, where in the cell and
 * which frame, so a regenerated or reloaded layer strews the same pieces with no entity and
 * no save state. A def's pieces are FLAT decals (lying on the ground in painter order like the
 * terrain under them — stones, litter) or UPRIGHT (standing on the ground the STANDING way —
 * a quad rising up = -z, depth-written and alpha-cut like a billboard — a grass tuft), the
 * flat style's cheapest depth cue. One VBO per def (its sprite's texture page), whole-layer
 * like RenderTileMap, rebuilt on markDirty(). Lit through the host RenderMesh pass
 * (`opt.lights`) in textured mode: flat pieces under the ground's straight-up normal, upright
 * ones under the billboards' bent one; unset (flat maps / no shader) submits fixed-function.
 * Insert right after the terrain passes: the flat pieces sit on the ground, and the upright
 * ones are in the depth pool before the entities draw.
 * @implements {RenderPass}
 */
globalThis.RenderDecor = class RenderDecor {
  /**
   * `layer.get(gx, gy)` must answer a TileType (or nothing). defs: [{ id, sprite, density,
   * upright? }] — `id` the TileType id a piece belongs to, `sprite` a GMSprite (its origin is
   * the piece's anchor — the foot of an upright piece, the centre of a flat one; the packer's
   * trim is read back like RenderTileMap), `density` the share of interior cells that carry a
   * piece (0..1), `upright` default false. opt: `lights` the host RenderMesh pass, `seed` the
   * placement hash seed, `alphaRef` the upright cutout (default 0.5).
   */
  constructor(layer, grid, defs, opt = {}) {
    this.enabled = true;
    this.layer = layer;
    this.grid = grid;
    this.defs = defs;
    this.lights = opt.lights;
    this.seed = opt.seed ?? 7;
    this.alphaRef = opt.alphaRef ?? 0.5;
    this._vbs = []; // parallel to defs: { vb, tex } or undefined when a def placed nothing
    this._dirty = true;
    this._lit = asset_get_index("shMeshlit");
    this._litOk = shaders_are_supported() && shader_is_compiled(this._lit);
    this._uAlphaRef = this._litOk
      ? shader_get_uniform(this._lit, "u_alphaRef")
      : -1;
  }

  destroy() {
    this._free();
  }

  markDirty() {
    this._dirty = true;
    return this;
  }

  _free() {
    for (let i = 0; i < this._vbs.length; i++)
      if (this._vbs[i] !== undefined) this._vbs[i].vb.destroy();
    this._vbs = [];
  }

  /** the TileType id at a cell, or -1 off the layer / on an empty cell */
  _idAt(gx, gy) {
    const { cols, rows } = this.grid;
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return -1;
    const t = this.layer.get(gx, gy);
    return t ? t.id : -1;
  }

  /** a cell of `id` whose 4-neighbours are `id` too — clear of every transition */
  _interior(gx, gy, id) {
    if (this._idAt(gx, gy) !== id) return false;
    if (this._idAt(gx - 1, gy) !== id) return false;
    if (this._idAt(gx + 1, gy) !== id) return false;
    if (this._idAt(gx, gy - 1) !== id) return false;
    return this._idAt(gx, gy + 1) === id;
  }

  /** one VBO per def: every interior cell rolls a piece off the position hash */
  _rebuild() {
    this._dirty = false;
    this._free();
    const cols = this.grid.cols;
    const rows = this.grid.rows;
    const cw = this.grid.cellWidth;
    const ch = this.grid.cellHeight;
    for (let k = 0; k < this.defs.length; k++) {
      const def = this.defs[k];
      const spr = def.sprite;
      const frames = sprite_get_number(spr);
      const sw = sprite_get_width(spr);
      const sh = sprite_get_height(spr);
      const xoff = sprite_get_xoffset(spr);
      const yoff = sprite_get_yoffset(spr);
      const salt = this.seed + k * 131;
      const vb = new VertexBuffer().begin();
      let n = 0;
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          if (hash2(gx, gy, salt) >= def.density) continue;
          if (!this._interior(gx, gy, def.id)) continue;
          // the piece's anchor inside the cell, 4 px in from its edges
          const px = gx * cw + 4 + hash2(gx, gy, salt + 1) * (cw - 8);
          const py = gy * ch + 4 + hash2(gx, gy, salt + 2) * (ch - 8);
          const frame = Math.min(
            frames - 1,
            Math.floor(hash2(gx, gy, salt + 3) * frames),
          );
          // the packer-trimmed rect, placed so the sprite's origin lands on the anchor
          const uv = sprite_get_uvs(spr, frame);
          const x = Math.round(px) - xoff + uv[4];
          const w = sw * uv[6];
          const h = sh * uv[7];
          if (def.upright === true)
            vb.addUpright(x, Math.round(py), -(yoff - uv[5]), w, h, uv[0], uv[1], uv[2], uv[3]);
          else
            vb.addQuad(x, Math.round(py) - yoff + uv[5], w, h, uv[0], uv[1], uv[2], uv[3]);
          n++;
        }
      }
      vb.end();
      if (n === 0) {
        vb.destroy();
        this._vbs.push(undefined);
      } else this._vbs.push({ vb: vb, tex: sprite_get_texture(spr, 0) });
    }
  }

  draw(entities) {
    if (this._dirty) this._rebuild();
    const lit = this.lights !== undefined && this.lights.litOk && this._litOk;
    // FLAT pieces: painter order on the ground, the terrain's own normal
    for (let k = 0; k < this.defs.length; k++) {
      const e = this._vbs[k];
      if (e === undefined || this.defs[k].upright === true) continue;
      if (lit) {
        this.lights.setupLights(entities);
        shader_set_uniform_f(this.lights.uUseTex, 1);
        shader_set_uniform_f(this.lights.uNormal, 0, 0, -1);
      }
      e.vb.submit(e.tex);
      if (lit) shader_reset();
    }
    // UPRIGHT pieces: in the depth pool, cut on the texel alpha, the billboards' bent normal
    gpu_set_zwriteenable(true);
    for (let k = 0; k < this.defs.length; k++) {
      const e = this._vbs[k];
      if (e === undefined || this.defs[k].upright !== true) continue;
      if (lit) {
        this.lights.setupLights(entities);
        shader_set_uniform_f(this.lights.uUseTex, 1);
        shader_set_uniform_f(this.lights.uNormal, 0, 0.5, -0.866);
        shader_set_uniform_f(this._uAlphaRef, this.alphaRef);
      }
      e.vb.submit(e.tex);
      if (lit) shader_reset();
    }
    gpu_set_zwriteenable(false);
  }
};
