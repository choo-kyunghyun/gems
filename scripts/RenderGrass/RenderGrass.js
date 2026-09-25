/**
 * Grass volume pass: stands clump sprites on every cell of a material, over the flat terrain.
 * Placement is deterministic — a position hash decides each cell's clumps — so a regenerated or
 * reloaded layer strews the same field with no entity and no save state. Clumps are depth-written
 * alpha-cut uprights with billboard pitch compensation; a `flat` def lies on the ground plane
 * instead. The sheet is a white tint mask, so one sheet colors every biome. Insert right after the
 * terrain passes, so the clumps are in the depth pool before the entities draw. Baked per chunk
 * (`Chunks`), so a terrain write rebakes only the chunks it reaches, once they are in view.
 * @implements {RenderPass}
 */
globalThis.RenderGrass = class RenderGrass {
  /**
   * `layer` is a tile layer (`LevelLayer`). A def grows on TileType `id` from a sheet
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
    this._chunks = new Chunks(grid, layer);
    // chunk k's batch for def d at k * defs.length + d; undefined where the def placed nothing
    this._batches = new Array(this._chunks.count * defs.length);
    this._range = { x0: 0, y0: 0, x1: 0, y1: 0 }; // the chunk being baked
    this._win = { x0: 0, y0: 0, x1: 0, y1: 0 }; // the chunks in view this frame
    this._uvs = []; // per frame of the def being baked, its UVs
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

  _free() {
    for (let i = 0; i < this._batches.length; i++)
      if (this._batches[i] !== undefined) this._batches[i].destroy();
    this._batches = [];
  }

  /**
   * Rebakes chunk `c`, one batch per def. A def grows on its own cells, or with no `edge` only on
   * those whose 4-neighbours are its too, clear of every transition; the cells are read off the
   * layer's ids, never a call per cell.
   */
  _bake(c) {
    this._chunks.dirty[c] = 0;
    const r = this._chunks.bounds(c, this._range);
    const cols = this.grid.cols;
    const rows = this.grid.rows;
    const x0 = r.x0;
    const y0 = r.y0;
    const x1 = r.x1 < cols ? r.x1 : cols;
    const y1 = r.y1 < rows ? r.y1 : rows;
    const cw = this.grid.cellWidth;
    const ch = this.grid.cellHeight;
    const d = this.layer.ids.data;
    const nd = this.defs.length;
    for (let k = 0; k < nd; k++) {
      const slot = c * nd + k;
      if (this._batches[slot] !== undefined) this._batches[slot].destroy();
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
      const id = def.id;
      const interior = def.edge !== true;
      const uvs = this._uvs; // per frame, read once per bake
      uvs.length = 0;
      const batch = new VertexBatch().begin();
      for (let gy = y0; gy < y1; gy++) {
        for (let gx = x0; gx < x1; gx++) {
          const i = gy * cols + gx;
          if (d[i] !== id) continue;
          if (interior) {
            if (gx === 0 || d[i - 1] !== id) continue;
            if (gx === cols - 1 || d[i + 1] !== id) continue;
            if (gy === 0 || d[i - cols] !== id) continue;
            if (gy === rows - 1 || d[i + cols] !== id) continue;
          }
          if (chance < 1 && hash2(gx, gy, salt + 1) >= chance) continue;
          const count =
            minC + Math.floor(hash2(gx, gy, salt) * (maxC - minC + 1));
          for (let n = 0; n < count; n++) {
            const s2 = salt + 7 + n * 53;
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
            let uv = uvs[frame];
            if (uv === undefined) {
              uv = batch.uvs(spr, frame);
              uvs[frame] = uv;
            }
            const w = (sw * uv[6] * sc) / dens;
            const h = (sh * uv[7] * sc) / dens;
            const a = ((xoff - uv[4]) * sc) / dens;
            const z0 = (-(yoff - uv[5]) * sc) / dens;
            const mirror = hash2(gx, gy, s2 + 3) >= 0.5;
            const qx = mirror ? px - (w - a) : px - a;
            const u0 = mirror ? uv[2] : uv[0];
            const u1 = mirror ? uv[0] : uv[2];
            if (flat) batch.addQuad(qx, py + z0, w, h, u0, uv[1], u1, uv[3], tint);
            else batch.addUpright(qx, py, z0, w, h, u0, uv[1], u1, uv[3], tint);
          }
        }
      }
      batch.end();
      if (batch.count === 0) {
        batch.destroy();
        this._batches[slot] = undefined;
      } else this._batches[slot] = batch;
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
    // pitch compensation is a z-scale about the ground plane, so every clump grows from its own
    // foot and a flat def is untouched
    const lit = this.lights !== undefined && this.lights.litOk && this._litOk;
    const pitch = this.camera !== undefined ? this.camera.pitch : 0;
    const tall = pitch > 0 ? 1 / Math.sin(pitch) : 1;
    const ident = matrix_build_identity();
    gpu_set_zwriteenable(true);
    matrix_set(matrix_world, matrix_build(0, 0, 0, 0, 0, 0, 1, 1, tall));
    const batches = this._batches;
    const nd = this.defs.length;
    for (let k = 0; k < nd; k++) {
      let placed = 0;
      for (let cy = w.y0; cy < w.y1; cy++)
        for (let cx = w.x0; cx < w.x1; cx++)
          if (batches[(cy * nx + cx) * nd + k] !== undefined) placed++;
      if (placed === 0) continue;
      if (lit) {
        this.lights.setupLights(entities);
        shader_set_uniform_f(this.lights.uUseTex, 1);
        if (this.defs[k].flat === true)
          shader_set_uniform_f(this.lights.uNormal, 0, 0, -1);
        else shader_set_uniform_f(this.lights.uNormal, 0, 0.5, -0.866);
        shader_set_uniform_f(this._uAlphaRef, this.alphaRef);
        shader_set_uniform_f(this._uSway, this.wind);
        shader_set_uniform_f(
          this._uSwayTime,
          this.time !== undefined ? this.time() : 0,
        );
      }
      for (let cy = w.y0; cy < w.y1; cy++)
        for (let cx = w.x0; cx < w.x1; cx++) {
          const batch = batches[(cy * nx + cx) * nd + k];
          if (batch !== undefined) batch.submit();
        }
      if (lit) shader_reset();
    }
    matrix_set(matrix_world, ident);
    gpu_set_zwriteenable(false);
  }
};
