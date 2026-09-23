/**
 * Grass volume pass: stands clump sprites on every cell of a material, over the flat terrain.
 * Placement is deterministic — a position hash decides each cell's clumps — so a regenerated or
 * reloaded layer strews the same field with no entity and no save state. Clumps are depth-written
 * alpha-cut uprights with billboard pitch compensation; a `flat` def lies on the ground plane
 * instead. The sheet is a white tint mask, so one sheet colors every biome. Insert right after the
 * terrain passes, so the clumps are in the depth pool before the entities draw.
 * @implements {RenderPass}
 */
globalThis.RenderGrass = class RenderGrass {
  /**
   * `layer.get(gx, gy)` answers a TileType or nothing. A def grows on TileType `id` from a sheet
   * of clump variants (origin at the foot); `chance` is the share of eligible cells carrying any,
   * `edge` includes transition cells, and `flat` lays variants with sprite-up as map north.
   * `opt.wind` is the sway strength (0 = rigid), phased on the sim clock `opt.time`.
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
    this.wind = opt.wind ?? 0;
    this.time = opt.time;
    this._batches = []; // parallel to defs; undefined where a def placed nothing
    this._dirty = true;
    this._lit = shMeshlit;
    this._litOk = shaders_are_supported() && shader_is_compiled(this._lit);
    this._uAlphaRef = this._litOk
      ? shader_get_uniform(this._lit, "u_alphaRef")
      : -1;
    this._uSway = this._litOk ? shader_get_uniform(this._lit, "u_sway") : -1;
    this._uSwayTime = this._litOk
      ? shader_get_uniform(this._lit, "u_swayTime")
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
    for (let i = 0; i < this._batches.length; i++)
      if (this._batches[i] !== undefined) this._batches[i].destroy();
    this._batches = [];
  }

  /** The TileType id at a cell, or -1 off the layer or on an empty cell. */
  _idAt(gx, gy) {
    const { cols, rows } = this.grid;
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) return -1;
    const t = this.layer.get(gx, gy);
    return t ? t.id : -1;
  }

  /** A cell of `id` whose 4-neighbours are `id` too, clear of every transition. */
  _interior(gx, gy, id) {
    if (this._idAt(gx, gy) !== id) return false;
    if (this._idAt(gx - 1, gy) !== id) return false;
    if (this._idAt(gx + 1, gy) !== id) return false;
    if (this._idAt(gx, gy - 1) !== id) return false;
    return this._idAt(gx, gy + 1) === id;
  }

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
      const dens = AssetMeta.density(spr); // source px per world px
      const sw = sprite_get_width(spr);
      const sh = sprite_get_height(spr);
      const xoff = sprite_get_xoffset(spr);
      const yoff = sprite_get_yoffset(spr);
      const minC = def.min !== undefined ? def.min : 1;
      const maxC = def.max !== undefined ? def.max : 2;
      const sMin = def.scaleMin !== undefined ? def.scaleMin : 1;
      const sMax = def.scaleMax !== undefined ? def.scaleMax : 1;
      const chance = def.chance !== undefined ? def.chance : 1;
      const tint = def.tint !== undefined ? def.tint : c_white;
      const flat = def.flat === true;
      const salt = this.seed + k * 131;
      const batch = new VertexBatch().begin();
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const on =
            def.edge === true
              ? this._idAt(gx, gy) === def.id
              : this._interior(gx, gy, def.id);
          if (!on) continue;
          if (chance < 1 && hash2(gx, gy, salt + 1) >= chance) continue;
          const count =
            minC + Math.floor(hash2(gx, gy, salt) * (maxC - minC + 1));
          for (let c = 0; c < count; c++) {
            const s2 = salt + 7 + c * 53;
            // snapped to the sheet's texel grid so the denser art still samples whole
            const px =
              Math.round((gx * cw + 2 + hash2(gx, gy, s2) * (cw - 4)) * dens) / dens;
            const py =
              Math.round((gy * ch + 2 + hash2(gx, gy, s2 + 1) * (ch - 4)) * dens) / dens;
            const frame = Math.min(
              frames - 1,
              Math.floor(hash2(gx, gy, s2 + 2) * frames),
            );
            // the packer-trimmed rect, foot on the anchor; a mirrored clump anchors from its
            // right edge
            const sc = sMin + hash2(gx, gy, s2 + 4) * (sMax - sMin);
            const uv = batch.uvs(spr, frame);
            const w = (sw * uv[6] * sc) / dens;
            const h = (sh * uv[7] * sc) / dens;
            const a = ((xoff - uv[4]) * sc) / dens;
            const z0 = (-(yoff - uv[5]) * sc) / dens;
            const mirror = hash2(gx, gy, s2 + 3) >= 0.5;
            const x0 = mirror ? px - (w - a) : px - a;
            const u0 = mirror ? uv[2] : uv[0];
            const u1 = mirror ? uv[0] : uv[2];
            if (flat) batch.addQuad(x0, py + z0, w, h, u0, uv[1], u1, uv[3], tint);
            else batch.addUpright(x0, py, z0, w, h, u0, uv[1], u1, uv[3], tint);
          }
        }
      }
      batch.end();
      if (batch.count === 0) {
        batch.destroy();
        this._batches.push(undefined);
      } else this._batches.push(batch);
    }
  }

  draw(entities) {
    if (this._dirty) this._rebuild();
    // pitch compensation is a z-scale about the ground plane, so every clump grows from its own
    // foot and a flat def is untouched
    const lit = this.lights !== undefined && this.lights.litOk && this._litOk;
    const pitch = this.camera !== undefined ? this.camera.pitch : 0;
    const tall = pitch > 0 ? 1 / Math.sin(pitch) : 1;
    const ident = matrix_build_identity();
    gpu_set_zwriteenable(true);
    matrix_set(matrix_world, matrix_build(0, 0, 0, 0, 0, 0, 1, 1, tall));
    for (let k = 0; k < this.defs.length; k++) {
      const batch = this._batches[k];
      if (batch === undefined) continue;
      if (lit) {
        this.lights.setupLights(entities);
        shader_set_uniform_f(this.lights.uUseTex, 1);
        if
 (this.defs[k].flat === true)
          shader_set_uniform_f(this.lights.uNormal, 0, 0, -1);
        else shader_set_uniform_f(this.lights.uNormal, 0, 0.5, -0.866);
        shader_set_uniform_f(this._uAlphaRef, this.alphaRef);
        shader_set_uniform_f(this._uSway, this.wind);
        shader_set_uniform_f(
          this._uSwayTime,
          this.time !== undefined ? this.time() : 0,
        );
      }
      batch.submit();
      if (lit) shader_reset();
    }
    matrix_set(matrix_world, ident);
    gpu_set_zwriteenable(false);
  }
};
