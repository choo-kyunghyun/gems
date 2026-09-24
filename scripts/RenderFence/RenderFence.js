/**
 * FENCE pass over the fence tile layer. A fence is thin CONNECTED geometry: a cell is a POST plus
 * a pair of RAILS toward each occupied 4-neighbor, so the occupancy read is the autotiling — no
 * frame table, no per-cell asset. A rail ends at the shared cell edge where the neighbor's
 * begins, so a run reads continuous in every direction, north-south included, which a side-view
 * sprite sheet can never show.
 *
 * Boxes are lit, depth-writing geometry, and only the TOP and SOUTH faces are emitted — the two
 * the fixed-yaw pitched camera can see. Vertices use the flat-tint lit layout (colour = the tint,
 * texcoord = the PACKED face normal: top (0,0), south (0,1)), so one buffer holds every
 * orientation. Without `opt.lights` (or its shader) the buffer submits unlit.
 *
 * VBO-cached, rebaked when the layer's `edits` moves. Coords are absolute world px.
 * @implements {RenderPass}
 */
globalThis.RenderFence = class RenderFence {
  static POST = 6; // square footprint, world px
  static RAIL_T = 2; // thickness across the run
  static RAIL_H = 3;
  static RAIL_TOP = [6, 14]; // each rail's top, measured DOWN from the post top

  /**
   * `layer` is any occupancy view: only a truthy `get(gx, gy)` is read. opt: `color` the flat
   * tint; `height` the post height in world px (default under a wall's, so a fenced yard reads
   * lower than a room); `lights` the host lit pass.
   */
  constructor(grid, layer, opt) {
    opt = opt ?? {};
    this.enabled = true;
    this.grid = grid;
    this.layer = layer;
    this.color = opt.color ?? c_white;
    this.height = opt.height ?? 24;
    this.lights = opt.lights;
    // must stay in lockstep with the lit mesh vertex layout
    vertex_format_begin();
    vertex_format_add_position_3d();
    vertex_format_add_colour();
    vertex_format_add_texcoord();
    this._format = vertex_format_end();
    this._vb = -1;
    this._baked = -1; // the layer's `edits` at the last bake; -1 = never
  }

  destroy() {
    this._free();
    vertex_format_delete(this._format);
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

  /** A north-south rail pair emits tops only — its south face hides under the next rail. */
  _quadsOf(gx, gy) {
    let n = 2;
    if (this._occupied(gx + 1, gy)) n += 4;
    if (this._occupied(gx - 1, gy)) n += 4;
    if (this._occupied(gx, gy - 1)) n += 2;
    if (this._occupied(gx, gy + 1)) n += 2;
    return n;
  }

  /**
   * Counts quads first for an exact fixed buffer. An empty layer stays -1 (a vertex buffer can't
   * be made from a 0-byte buffer).
   */
  _rebuild() {
    this._baked = this.layer.edits;
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
    // up = -z
    const top = (x0, y0, x1, y1, z) => {
      vert(x0, y0, z, 0, 0);
      vert(x1, y0, z, 0, 0);
      vert(x1, y1, z, 0, 0);
      vert(x0, y0, z, 0, 0);
      vert(x1, y1, z, 0, 0);
      vert(x0, y1, z, 0, 0);
    };
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
        top(cx - hp, cy - hp, cx + hp, cy + hp, -H);
        south(cx - hp, cx + hp, cy + hp, -H, 0);
        const e = this._occupied(gx + 1, gy);
        const w = this._occupied(gx - 1, gy);
        const n = this._occupied(gx, gy - 1);
        const s = this._occupied(gx, gy + 1);
        for (let r = 0; r < tops.length; r++) {
          const zt = -H + tops[r];
          const zb = zt + RenderFence.RAIL_H; // a larger z is lower
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
    if (this.layer.edits !== this._baked) this._rebuild();
    if (this._vb === -1) return;
    // global default is off
    gpu_set_zwriteenable(true);
    const lit = this.lights !== undefined && this.lights.litOk;
    if (lit) this.lights.setupLights(entities);
    vertex_submit(this._vb, pr_trianglelist, -1);
    if (lit) shader_reset();
    gpu_set_zwriteenable(false);
  }
};
