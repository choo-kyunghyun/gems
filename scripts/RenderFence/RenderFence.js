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
 * VBO-cached per chunk (`Chunks`), so a write rebakes only the chunks it reaches, once they are in
 * view. Coords are absolute world px.
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
   * lower than a room); `lights` the host lit pass; `camera` limits the drawn chunks to its view.
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
    this.camera = opt.camera;
    this._chunks = new Chunks(grid, layer);
    this._range = { x0: 0, y0: 0, x1: 0, y1: 0 }; // the chunk being baked
    this._win = { x0: 0, y0: 0, x1: 0, y1: 0 }; // the chunks in view this frame
    this._vbs = new Array(this._chunks.count).fill(-1); // per chunk; -1 where it holds no fence
  }

  destroy() {
    for (let c = 0; c < this._vbs.length; c++) this._free(c);
    vertex_format_delete(this._format);
  }

  _free(c) {
    if (this._vbs[c] !== -1) vertex_delete_buffer(this._vbs[c]);
    this._vbs[c] = -1;
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
   * Rebakes chunk `c`, counting quads first for an exact fixed buffer. An empty chunk stays -1 (a
   * vertex buffer can't be made from a 0-byte buffer).
   */
  _bake(c) {
    this._chunks.dirty[c] = 0;
    this._free(c);
    const r = this._chunks.bounds(c, this._range);
    const cols = this.grid.cols;
    const rows = this.grid.rows;
    const x0 = r.x0;
    const y0 = r.y0;
    const x1 = r.x1 < cols ? r.x1 : cols;
    const y1 = r.y1 < rows ? r.y1 : rows;
    let quads = 0;
    for (let gy = y0; gy < y1; gy++)
      for (let gx = x0; gx < x1; gx++)
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
    for (let gy = y0; gy < y1; gy++) {
      for (let gx = x0; gx < x1; gx++) {
        if (!this._occupied(gx, gy)) continue;
        const px0 = gx * cw;
        const py0 = gy * ch;
        const px1 = px0 + cw;
        const py1 = py0 + ch;
        const cx = px0 + cw / 2;
        const cy = py0 + ch / 2;
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
            top(cx + hp, cy - ht, px1, cy + ht, zt);
            south(cx + hp, px1, cy + ht, zt, zb);
          }
          if (w) {
            top(px0, cy - ht, cx - hp, cy + ht, zt);
            south(px0, cx - hp, cy + ht, zt, zb);
          }
          if (n) top(cx - ht, py0, cx + ht, cy - hp, zt);
          if (s) top(cx - ht, cy + hp, cx + ht, py1, zt);
        }
      }
    }
    const vb = vertex_create_buffer_from_buffer(buf, this._format);
    buffer_delete(buf);
    vertex_freeze(vb);
    this._vbs[c] = vb;
  }

  draw(entities) {
    const chunks = this._chunks;
    chunks.sync();
    const w = chunks.window(this.camera, this._win);
    const dirty = chunks.dirty;
    const nx = chunks.nx;
    const vbs = this._vbs;
    let fences = 0;
    for (let cy = w.y0; cy < w.y1; cy++)
      for (let cx = w.x0; cx < w.x1; cx++) {
        const c = cy * nx + cx;
        if (dirty[c] === 1) this._bake(c);
        if (vbs[c] !== -1) fences++;
      }
    if (fences === 0) return;
    // global default is off
    gpu_set_zwriteenable(true);
    const lit = this.lights !== undefined && this.lights.litOk;
    if (lit) this.lights.setupLights(entities);
    for (let cy = w.y0; cy < w.y1; cy++)
      for (let cx = w.x0; cx < w.x1; cx++) {
        const vb = vbs[cy * nx + cx];
        if (vb !== -1) vertex_submit(vb, pr_trianglelist, -1);
      }
    if (lit) shader_reset();
    gpu_set_zwriteenable(false);
  }
};
