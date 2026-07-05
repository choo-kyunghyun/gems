/**
 * WALLS pass of the art projection contract (ROADMAP.md — Art Rework): draws a solid tile
 * layer as lit boxes. Per wall cell it emits a plan-view TOP quad (at -height) plus a
 * vertical SOUTH face only where the south neighbor is empty — the two orientations the
 * fixed-yaw pitched camera can ever see (the vox-kit contract). Hidden-face removal happens
 * HERE at build time; no emitted face can backface a fixed-yaw camera, so GPU cull modes
 * would have nothing left to remove.
 *
 * Vertices are the vox-kit 24 B/vertex format (position_3d + colour + texcoord), in one of
 * two sh_meshlit modes (both share the sun + view-culled point lights supplied by the host
 * RenderMesh pass, `opt.lights`, whose _setupLights runs before the submits — walls join the
 * same depth pool as furniture and billboards, z-write on for the submit):
 * - TEXTURED (opt.sprite set): texcoord = real frame UVs, colour = the material tint
 *   (texture × tint × light — grayscale-ish pattern textures let one texture serve every
 *   material color), and the face normal rides the u_normal UNIFORM — constant per
 *   orientation, so the pass keeps tops and souths in separate buffers and submits each
 *   under its own normal (u_useTex = 1). Faces must stay opaque (depth-writing geometry).
 * - FLAT TINT (no sprite): texcoord = the PACKED face normal (top (0,0), south (0,1)),
 *   colour = the tint — the vox mode, u_useTex = 0. Also the sprite-missing fallback.
 * Without the shader (or no host pass) both modes submit fixed-function: textured × colour
 * or flat colour, unlit — same degradation as RenderMesh.
 *
 * VBO-cached like RenderTileMap: call markDirty() after any tile edit — BuildMode's
 * _markTileDirty reaches it through scene._tilePasses. Coords are absolute world px, so the
 * draw needs no world matrix and a whole-layer rebuild is one pass over the grid.
 * @implements {RenderPass}
 */
globalThis.RenderWalls = class RenderWalls {
  /**
   * @param {LevelGrid} level - grid geometry (cols/rows/cellWidth/cellHeight)
   * @param {TileLayer} layer - the solid layer to draw (truthy cell = wall). Only `get(gx, gy)`
   *   is read, so any occupancy view satisfies it — ChunkManager.wallLayer() hands the streamed
   *   overworld's authored walls to a second instance of this pass.
   * @param {{ height?: number, color?: number, sprite?: any, frame?: number, lights?: RenderMesh }} [opt]
   *   `sprite` is an asset REF (validated via sprite_exists — asset_get_index refs never
   *   compare >= 0 on GMRT); `frame` picks the subimage (default 0).
   */
  constructor(level, layer, opt) {
    opt = opt ?? {};
    this.enabled = true;
    this.level = level;
    this.layer = layer;
    this.height = opt.height ?? 16; // wall height in world px (visual only — colliders are TileEdit's)
    this.color = opt.color ?? c_white;
    this.sprite = opt.sprite;
    this.frame = opt.frame ?? 0;
    this._texOk = this.sprite !== undefined && sprite_exists(this.sprite);
    this.lights = opt.lights; // host RenderMesh pass (shares sh_meshlit + its light gather)
    // same 24 B/vertex declaration as RenderMesh._format — the lockstep vox-kit layout
    vertex_format_begin();
    vertex_format_add_position_3d();
    vertex_format_add_colour();
    vertex_format_add_texcoord();
    this._format = vertex_format_end();
    this._vbTop = -1; // all top quads; textured mode submits it under normal (0,0,-1)
    this._vbSouth = -1; // all exposed south quads; textured normal (0,1,0)
    this._dirty = true;
  }

  destroy() {
    this._free();
    vertex_format_delete(this._format);
  }

  markDirty() {
    this._dirty = true;
  }

  _free() {
    if (this._vbTop !== -1) vertex_delete_buffer(this._vbTop);
    if (this._vbSouth !== -1) vertex_delete_buffer(this._vbSouth);
    this._vbTop = -1;
    this._vbSouth = -1;
  }

  // rebuild the two whole-layer VBOs: count quads for exact fixed buffers, then write
  // vertices (byte order per vox2vbuf: 3×f32 pos, R,G,B,A u8, 2×f32 texcoord). An empty
  // layer leaves both at -1 (vertex_create_buffer_from_buffer can't take a 0-byte buffer).
  _rebuild() {
    this._dirty = false;
    this._free();
    const cols = this.level.cols;
    const rows = this.level.rows;
    let tops = 0;
    let souths = 0;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if (!this.layer.get(gx, gy)) continue;
        tops++;
        if (!this.layer.get(gx, gy + 1)) souths++; // exposed south face only
      }
    }
    if (tops === 0) return;

    // textured mode: the frame's texture-page UV rect, stretched over each face (trim
    // insets [4..7] ignored — a full-bleed tile texture is never trimmed); flat mode: the
    // packed face normals sh_meshlit's vox path decodes
    const uv = this._texOk
      ? sprite_get_uvs(this.sprite, this.frame)
      : [0, 0, 0, 0];
    const u0 = uv[0];
    const v0 = uv[1];
    const u1 = this._texOk ? uv[2] : 0;
    const v1 = this._texOk ? uv[3] : 0;
    const r = color_get_red(this.color);
    const g = color_get_green(this.color);
    const b = color_get_blue(this.color);
    const vert = (buf, x, y, z, u, v) => {
      buffer_write(buf, buffer_f32, x);
      buffer_write(buf, buffer_f32, y);
      buffer_write(buf, buffer_f32, z);
      buffer_write(buf, buffer_u8, r);
      buffer_write(buf, buffer_u8, g);
      buffer_write(buf, buffer_u8, b);
      buffer_write(buf, buffer_u8, 255);
      buffer_write(buf, buffer_f32, u);
      buffer_write(buf, buffer_f32, v);
    };
    const bufT = buffer_create(tops * 6 * 24, buffer_fixed, 1);
    const bufS =
      souths > 0 ? buffer_create(souths * 6 * 24, buffer_fixed, 1) : -1;
    const cw = this.level.cellWidth;
    const ch = this.level.cellHeight;
    const H = this.height;
    // flat mode packs the SOUTH normal (0,1) into the south quads' texcoord; textured mode
    // reuses the same UV rect on both faces (dedicated top/side textures are the art seam)
    const sv0 = this._texOk ? v0 : 1;
    const sv1 = this._texOk ? v1 : 1;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if (!this.layer.get(gx, gy)) continue;
        const x0 = gx * cw;
        const y0 = gy * ch;
        const x1 = x0 + cw;
        const y1 = y0 + ch;
        // TOP quad lying flat at -H (up = -z)
        vert(bufT, x0, y0, -H, u0, v0);
        vert(bufT, x1, y0, -H, u1, v0);
        vert(bufT, x1, y1, -H, u1, v1);
        vert(bufT, x0, y0, -H, u0, v0);
        vert(bufT, x1, y1, -H, u1, v1);
        vert(bufT, x0, y1, -H, u0, v1);
        // SOUTH face at y1, top edge shared with the TOP quad (no seam)
        if (!this.layer.get(gx, gy + 1)) {
          vert(bufS, x0, y1, -H, u0, sv0);
          vert(bufS, x1, y1, -H, u1, sv0);
          vert(bufS, x1, y1, 0, u1, sv1);
          vert(bufS, x0, y1, -H, u0, sv0);
          vert(bufS, x1, y1, 0, u1, sv1);
          vert(bufS, x0, y1, 0, u0, sv1);
        }
      }
    }
    this._vbTop = vertex_create_buffer_from_buffer(bufT, this._format);
    buffer_delete(bufT);
    vertex_freeze(this._vbTop);
    if (bufS !== -1) {
      this._vbSouth = vertex_create_buffer_from_buffer(bufS, this._format);
      buffer_delete(bufS);
      vertex_freeze(this._vbSouth);
    }
  }

  draw(world) {
    if (this._dirty) this._rebuild();
    if (this._vbTop === -1) return;
    // depth-writing like RenderMesh/RenderBillboard (global default is off)
    gpu_set_zwriteenable(true);
    const lit = this.lights !== undefined && this.lights._litOk;
    if (lit) this.lights._setupLights(world); // sets sh_meshlit + sun/point uniforms (u_useTex 0)
    if (this._texOk) {
      // textured: real UVs, face normal per SUBMIT via uniform (all tops, then all souths)
      const tex = sprite_get_texture(this.sprite, this.frame);
      if (lit) {
        shader_set_uniform_f(this.lights._uUseTex, 1);
        shader_set_uniform_f(this.lights._uNormal, 0, 0, -1);
      }
      vertex_submit(this._vbTop, pr_trianglelist, tex);
      if (this._vbSouth !== -1) {
        // per-submit uniform swap verified pixel-exact on 0.20 (top ×1.0, south ×0.76 —
        // probed 2026-07-06): a uniform re-set between two vertex_submits applies correctly
        if (lit) shader_set_uniform_f(this.lights._uNormal, 0, 1, 0);
        vertex_submit(this._vbSouth, pr_trianglelist, tex);
      }
    } else {
      // flat tint: packed-normal vox mode, untextured
      vertex_submit(this._vbTop, pr_trianglelist, -1);
      if (this._vbSouth !== -1)
        vertex_submit(this._vbSouth, pr_trianglelist, -1);
    }
    if (lit) shader_reset();
    gpu_set_zwriteenable(false);
  }
};
