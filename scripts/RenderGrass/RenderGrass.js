/**
 * GRASS pass — the grass ground's VOLUME layer, the way a 3D game scatters grass meshes
 * over green terrain: the flat terrain pass under it keeps the distant color mass, this
 * pass stands HD clump sprites (denser sheet than the world — SpriteMeta density) on every
 * cell of its material. With enough clumps per cell (the sheet's MAT variants near-solid at
 * the root) the field carries the color mass itself and needs no grass tileset under it —
 * `edge` then stands clumps on transition cells too, so the field's border is the organic
 * feather of the scatter, not a dual-grid outline. Placement is DETERMINISTIC: a position
 * hash decides each cell's clump count, anchors, frames and mirror, so a regenerated or
 * reloaded layer strews the same field with no entity and no save state — the terrain it
 * stands on regenerates from its seed the same way. One VBO per def, whole-layer, rebuilt
 * on markDirty(); clumps are depth-written alpha-cut uprights under the billboards' bent
 * normal and pitch compensation (RenderDecor's rules). Insert right after the decor pass.
 * Sway hooks in later as a shMeshlit vertex animation on the sim clock, wave-mode style.
 * @implements {RenderPass}
 */
globalThis.RenderGrass = class RenderGrass {
  /**
   * `layer.get(gx, gy)` must answer a TileType (or nothing). defs: [{ id, sprite, min?,
   * max?, edge? }] — `id` the TileType id the field grows on, `sprite` a GMSprite of clump
   * VARIANTS (origin at the foot; half are mirrored), `min`..`max` the per-cell count the
   * hash rolls (default 1..2), `scaleMin`..`scaleMax` the per-clump size the hash rolls
   * (default 1..1, about the foot — a stretched clump resamples its texels, invisible on
   * one-tone art), `edge` true to include transition cells (tileset-free fields). opt: `lights` the host RenderMesh pass, `camera` the Camera whose pitch the
   * clumps compensate, `seed` the placement hash seed, `alphaRef` the cutout (default 0.5).
   */
  constructor(layer, grid, defs, opt = {}) {
    this.enabled = true;
    this.layer = layer;
    this.grid = grid;
    this.defs = defs;
    this.lights = opt.lights;
    this.camera = opt.camera;
    this.seed = opt.seed ?? 19;
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

  /** one VBO per def: every interior cell rolls its clumps off the position hash */
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
      const dens = SpriteMeta.density(spr); // source px per world px — divides every extent
      const sw = sprite_get_width(spr);
      const sh = sprite_get_height(spr);
      const xoff = sprite_get_xoffset(spr);
      const yoff = sprite_get_yoffset(spr);
      const minC = def.min !== undefined ? def.min : 1;
      const maxC = def.max !== undefined ? def.max : 2;
      const sMin = def.scaleMin !== undefined ? def.scaleMin : 1;
      const sMax = def.scaleMax !== undefined ? def.scaleMax : 1;
      const salt = this.seed + k * 131;
      const vb = new VertexBuffer().begin();
      let n = 0;
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const on =
            def.edge === true
              ? this._idAt(gx, gy) === def.id
              : this._interior(gx, gy, def.id);
          if (!on) continue;
          const count =
            minC + Math.floor(hash2(gx, gy, salt) * (maxC - minC + 1));
          for (let c = 0; c < count; c++) {
            const s2 = salt + 7 + c * 53;
            // the clump's foot inside the cell, 2 px in from its edges, snapped to the
            // sheet's texel grid so the denser art still samples whole
            const px =
              Math.round((gx * cw + 2 + hash2(gx, gy, s2) * (cw - 4)) * dens) / dens;
            const py =
              Math.round((gy * ch + 2 + hash2(gx, gy, s2 + 1) * (ch - 4)) * dens) / dens;
            const frame = Math.min(
              frames - 1,
              Math.floor(hash2(gx, gy, s2 + 2) * frames),
            );
            // the packer-trimmed rect over the sheet density, foot on the anchor; a
            // mirrored clump swaps u and anchors from its right edge
            const sc = sMin + hash2(gx, gy, s2 + 4) * (sMax - sMin);
            const uv = sprite_get_uvs(spr, frame);
            const w = (sw * uv[6] * sc) / dens;
            const h = (sh * uv[7] * sc) / dens;
            const a = ((xoff - uv[4]) * sc) / dens;
            const z0 = (-(yoff - uv[5]) * sc) / dens;
            if (hash2(gx, gy, s2 + 3) < 0.5)
              vb.addUpright(px - a, py, z0, w, h, uv[0], uv[1], uv[2], uv[3]);
            else
              vb.addUpright(px - (w - a), py, z0, w, h, uv[2], uv[1], uv[0], uv[3]);
            n++;
          }
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
    // in the depth pool, cut on the texel alpha, the billboards' bent normal, and the
    // billboards' pitch compensation — a z-scale about the ground plane, so every clump
    // grows from its own foot
    const lit = this.lights !== undefined && this.lights.litOk && this._litOk;
    const pitch = this.camera !== undefined ? this.camera.pitch : 0;
    const tall = pitch > 0 ? 1 / Math.sin(pitch) : 1;
    const ident = matrix_build_identity();
    gpu_set_zwriteenable(true);
    matrix_set(matrix_world, matrix_build(0, 0, 0, 0, 0, 0, 1, 1, tall));
    for (let k = 0; k < this.defs.length; k++) {
      const e = this._vbs[k];
      if (e === undefined) continue;
      if (lit) {
        this.lights.setupLights(entities);
        shader_set_uniform_f(this.lights.uUseTex, 1);
        shader_set_uniform_f(this.lights.uNormal, 0, 0.5, -0.866);
        shader_set_uniform_f(this._uAlphaRef, this.alphaRef);
      }
      e.vb.submit(e.tex);
      if (lit) shader_reset();
    }
    matrix_set(matrix_world, ident);
    gpu_set_zwriteenable(false);
  }
};
