/**
 * FENCE pass — the WALLS category of the art projection contract (RenderBillboard) over the
 * fence tile layer. A fence is thin CONNECTED geometry, so a cell is drawn as a POST plus a pair
 * of RAILS toward each occupied 4-neighbor: the autotiling IS the occupancy read (the same
 * neighbor mask blob4 keys a frame by), with no frame table and no per-cell asset. A rail ends
 * at the shared cell edge where the neighbor's rail begins, so a run reads as one continuous
 * fence in every direction — north-south included, which a side-view sprite sheet can never show.
 *
 * Boxes are lit, depth-writing geometry like RenderWalls' walls, and per box only the plan-view
 * TOP and the SOUTH face are emitted (the two orientations the fixed-yaw pitched camera can see —
 * RenderWalls' rule): a north-south rail's end caps hide under the neighboring rail's top, and a
 * rail's inner end sits inside the post, so neither is emitted. Vertices are the Vox 24 B/vertex
 * layout in shMeshlit's FLAT-TINT mode (colour = the tint, texcoord = the PACKED face normal:
 * top (0,0), south (0,1)) — one buffer, no per-orientation split, since the normal rides the
 * vertex. Lights come from the host RenderMesh pass (`opt.lights`) like every world pass; without
 * it (or the shader) the buffer submits unlit.
 *
 * VBO-cached like RenderTileMap/RenderWalls: markDirty() after any tile edit — BuildMode's
 * _markTileDirty reaches it through scene._tilePasses. Coords are absolute world px.
 * @implements {RenderPass}
 */
globalThis.RenderFence = class RenderFence {
  static POST = 6; // post footprint (world px, square)
  static RAIL_T = 2; // rail thickness across its run
  static RAIL_H = 3; // rail height
  static RAIL_TOP = [6, 14]; // each rail's top, measured DOWN from the post top

  /**
   * `layer`: only `get(gx, gy)` is read (truthy cell = fence), so any occupancy view satisfies
   * it. opt: `color` the flat tint (default c_white); `height` the post height in world px
   * (default 24 — under the 32 px wall, so a fenced yard reads lower than a room); `lights` the
   * host RenderMesh pass.
   */
  constructor(grid, layer, opt) {
    opt = opt ?? {};
    this.enabled = true;
    this.grid = grid;
    this.layer = layer;
    this.color = opt.color ?? c_white;
    this.height = opt.height ?? 24;
    this.lights = opt.lights;
    // the lockstep Vox layout (RenderMesh._format / RenderWalls)
    vertex_format_begin();
    vertex_format_add_position_3d();
    vertex_format_add_colour();
    vertex_format_add_texcoord();
    this._format = vertex_format_end();
    this._vb = -1;
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
    if (this._vb !== -1) vertex_delete_buffer(this._vb);
    this._vb = -1;
  }

  _occupied(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= this.grid.cols || gy >= this.grid.rows)
      return false;
    return !!this.layer.get(gx, gy);
  }

  /**
   * quads a fence cell emits: the post 2, each east/west rail pair 4 (top + south per rail),
   * each north/south pair 2 (tops only — see the class doc)
   */
  _quadsOf(gx, gy) {
    let n = 2;
    if (this._occupied(gx + 1, gy)) n += 4;
    if (this._occupied(gx - 1, gy)) n += 4;
    if (this._occupied(gx, gy - 1)) n += 2;
    if (this._occupied(gx, gy + 1)) n += 2;
    return n;
  }

  /**
   * rebuild the whole-layer VBO: count quads for an exact fixed buffer, then write vertices
   * (byte order per Vox: 3×f32 pos, R,G,B,A u8, 2×f32 packed normal). An empty layer stays -1
   * (vertex_create_buffer_from_buffer can't take a 0-byte buffer).
   */
  _rebuild() {
    this._dirty = false;
    this._free();
    const cols = this.grid.cols;
    const rows = this.grid.rows;
    let quads = 0;
    for (let gy = 0; gy < rows; gy++)
      for (let gx = 0; gx < cols; gx++)
        if (this._occupied(gx, gy)) quads += this._quadsOf(gx, gy);
    if (quads === 0) return;

    const buf = buffer_create(quads * 6 * 24, buffer_fixed, 1);
    const R = color_get_red(this.color);
    const G = color_get_green(this.color);
    const B = color_get_blue(this.color);
    const vert = (x, y, z, u, v) => {
      buffer_write(buf, buffer_f32, x);
      buffer_write(buf, buffer_f32, y);
      buffer_write(buf, buffer_f32, z);
      buffer_write(buf, buffer_u8, R);
      buffer_write(buf, buffer_u8, G);
      buffer_write(buf, buffer_u8, B);
      buffer_write(buf, buffer_u8, 255);
      buffer_write(buf, buffer_f32, u);
      buffer_write(buf, buffer_f32, v);
    };
    // TOP quad lying flat at z (up = -z), packed normal (0,0)
    const top = (x0, y0, x1, y1, z) => {
      vert(x0, y0, z, 0, 0);
      vert(x1, y0, z, 0, 0);
      vert(x1, y1, z, 0, 0);
      vert(x0, y0, z, 0, 0);
      vert(x1, y1, z, 0, 0);
      vert(x0, y1, z, 0, 0);
    };
    // SOUTH face at y, from z0 (its top) down to z1, packed normal (0,1)
    const south = (x0, x1, y, z0, z1) => {
      vert(x0, y, z0, 0, 1);
      vert(x1, y, z0, 0, 1);
      vert(x1, y, z1, 0, 1);
      vert(x0, y, z0, 0, 1);
      vert(x1, y, z1, 0, 1);
      vert(x0, y, z1, 0, 1);
    };

    const cw = this.grid.cellWidth;
    const ch = this.grid.cellHeight;
    const H = this.height;
    const hp = RenderFence.POST / 2;
    const ht = RenderFence.RAIL_T / 2;
    const tops = RenderFence.RAIL_TOP;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if (!this._occupied(gx, gy)) continue;
        const x0 = gx * cw;
        const y0 = gy * ch;
        const x1 = x0 + cw;
        const y1 = y0 + ch;
        const cx = x0 + cw / 2;
        const cy = y0 + ch / 2;
        // POST: top at -H, south face down to the ground
        top(cx - hp, cy - hp, cx + hp, cy + hp, -H);
        south(cx - hp, cx + hp, cy + hp, -H, 0);
        // RAILS: from the post's side to the cell edge, two per occupied direction
        const e = this._occupied(gx + 1, gy);
        const w = this._occupied(gx - 1, gy);
        const n = this._occupied(gx, gy - 1);
        const s = this._occupied(gx, gy + 1);
        for (let r = 0; r < tops.length; r++) {
          const zt = -H + tops[r]; // rail top
          const zb = zt + RenderFence.RAIL_H; // rail bottom (a larger z is lower)
          if (e) {
            top(cx + hp, cy - ht, x1, cy + ht, zt);
            south(cx + hp, x1, cy + ht, zt, zb);
          }
          if (w) {
            top(x0, cy - ht, cx - hp, cy + ht, zt);
            south(x0, cx - hp, cy + ht, zt, zb);
          }
          if (n) top(cx - ht, y0, cx + ht, cy - hp, zt);
          if (s) top(cx - ht, cy + hp, cx + ht, y1, zt);
        }
      }
    }
    this._vb = vertex_create_buffer_from_buffer(buf, this._format);
    buffer_delete(buf);
    vertex_freeze(this._vb);
  }

  draw(entities) {
    if (this._dirty) this._rebuild();
    if (this._vb === -1) return;
    // depth-writing like RenderMesh/RenderWalls (global default is off)
    gpu_set_zwriteenable(true);
    const lit = this.lights !== undefined && this.lights.litOk;
    if (lit) this.lights.setupLights(entities); // shMeshlit in vox (packed-normal) mode
    vertex_submit(this._vb, pr_trianglelist, -1);
    if (lit) shader_reset();
    gpu_set_zwriteenable(false);
  }
};
