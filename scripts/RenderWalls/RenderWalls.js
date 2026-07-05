/**
 * WALLS pass of the art projection contract (ROADMAP.md — Art Rework): draws a solid tile
 * layer as lit boxes. Per wall cell it emits a plan-view TOP quad (at -height) plus a
 * vertical SOUTH face only where the south neighbor is empty — the two orientations the
 * fixed-yaw pitched camera can ever see (the vox-kit contract). Hidden-face removal happens
 * HERE at build time; no emitted face can backface a fixed-yaw camera, so GPU cull modes
 * would have nothing left to remove.
 *
 * Vertices are the vox-kit 24 B/vertex format (position_3d + colour + texcoord): the COLOUR
 * carries the material tint (flat albedo — phase 2 swaps in face textures via a sh_walllit
 * variant) and the texcoord carries the PACKED FACE NORMAL (u = nx, v = ny — top (0,0),
 * south (0,1)), so the buffer submits under sh_meshlit unchanged: `opt.lights` is the host
 * RenderMesh pass, whose _setupLights supplies this frame's sun + view-culled point lights.
 * Walls thus join the same depth pool as furniture and billboards (z-write on for the
 * submit); without the shader (or no host) the fallback is flat tint, like RenderMesh.
 *
 * VBO-cached like RenderTileMap: call markDirty() after any tile edit — BuildMode's
 * _markTileDirty reaches it through scene._tilePasses. Coords are absolute world px, so the
 * draw needs no world matrix and a whole-layer rebuild is one buffer.
 * @implements {RenderPass}
 */
globalThis.RenderWalls = class RenderWalls {
  /**
   * @param {LevelGrid} level - grid geometry (cols/rows/cellWidth/cellHeight)
   * @param {TileLayer} layer - the solid layer to draw (truthy cell = wall)
   * @param {{ height?: number, color?: number, lights?: RenderMesh }} [opt]
   */
  constructor(level, layer, opt) {
    opt = opt ?? {};
    this.enabled = true;
    this.level = level;
    this.layer = layer;
    this.height = opt.height ?? 16; // wall height in world px (visual only — colliders are TileEdit's)
    this.color = opt.color ?? c_white;
    this.lights = opt.lights; // host RenderMesh pass (shares sh_meshlit + its light gather)
    // same 24 B/vertex declaration as RenderMesh._format — the lockstep vox-kit layout
    vertex_format_begin();
    vertex_format_add_position_3d();
    vertex_format_add_colour();
    vertex_format_add_texcoord();
    this._format = vertex_format_end();
    this._vb = -1;
    this._dirty = true;
  }

  destroy() {
    if (this._vb !== -1) vertex_delete_buffer(this._vb);
    this._vb = -1;
    vertex_format_delete(this._format);
  }

  markDirty() {
    this._dirty = true;
  }

  // rebuild the whole-layer VBO: count quads for an exact fixed buffer, then write vertices
  // (byte order per vox2vbuf: 3×f32 pos, R,G,B,A u8, 2×f32 packed normal). An empty layer
  // leaves _vb at -1 (vertex_create_buffer_from_buffer can't take a 0-byte buffer).
  _rebuild() {
    this._dirty = false;
    if (this._vb !== -1) {
      vertex_delete_buffer(this._vb);
      this._vb = -1;
    }
    const cols = this.level.cols;
    const rows = this.level.rows;
    let quads = 0;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if (!this.layer.get(gx, gy)) continue;
        quads++; // top
        if (!this.layer.get(gx, gy + 1)) quads++; // exposed south face
      }
    }
    if (quads === 0) return;

    const buf = buffer_create(quads * 6 * 24, buffer_fixed, 1);
    const r = color_get_red(this.color);
    const g = color_get_green(this.color);
    const b = color_get_blue(this.color);
    const vert = (x, y, z, nu, nv) => {
      buffer_write(buf, buffer_f32, x);
      buffer_write(buf, buffer_f32, y);
      buffer_write(buf, buffer_f32, z);
      buffer_write(buf, buffer_u8, r);
      buffer_write(buf, buffer_u8, g);
      buffer_write(buf, buffer_u8, b);
      buffer_write(buf, buffer_u8, 255);
      buffer_write(buf, buffer_f32, nu);
      buffer_write(buf, buffer_f32, nv);
    };
    const cw = this.level.cellWidth;
    const ch = this.level.cellHeight;
    const H = this.height;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if (!this.layer.get(gx, gy)) continue;
        const x0 = gx * cw;
        const y0 = gy * ch;
        const x1 = x0 + cw;
        const y1 = y0 + ch;
        // TOP quad lying flat at -H (up = -z), normal (0,0,-1) → packed (0,0)
        vert(x0, y0, -H, 0, 0);
        vert(x1, y0, -H, 0, 0);
        vert(x1, y1, -H, 0, 0);
        vert(x0, y0, -H, 0, 0);
        vert(x1, y1, -H, 0, 0);
        vert(x0, y1, -H, 0, 0);
        // SOUTH face at y1, top edge shared with the TOP quad (no seam), normal (0,1,0) → (0,1)
        if (!this.layer.get(gx, gy + 1)) {
          vert(x0, y1, -H, 0, 1);
          vert(x1, y1, -H, 0, 1);
          vert(x1, y1, 0, 0, 1);
          vert(x0, y1, -H, 0, 1);
          vert(x1, y1, 0, 0, 1);
          vert(x0, y1, 0, 0, 1);
        }
      }
    }
    this._vb = vertex_create_buffer_from_buffer(buf, this._format);
    buffer_delete(buf);
    vertex_freeze(this._vb);
  }

  draw(world) {
    if (this._dirty) this._rebuild();
    if (this._vb === -1) return;
    // depth-writing like RenderMesh/RenderBillboard (global default is off)
    gpu_set_zwriteenable(true);
    const lit = this.lights !== undefined && this.lights._litOk;
    if (lit) this.lights._setupLights(world); // sets sh_meshlit + this frame's sun/point uniforms
    vertex_submit(this._vb, pr_trianglelist, -1);
    if (lit) shader_reset();
    gpu_set_zwriteenable(false);
  }
};
