/**
 * Draws a solid tile layer as lit boxes: per wall cell a top quad at -height, plus a south face
 * only where the south neighbour is empty — the only two orientations a fixed-yaw pitched camera
 * sees, so hidden faces are removed at build time rather than by GPU culling.
 *
 * A textured material carries real frame UVs and a tint, with the face normal as a uniform, so
 * tops and souths live in separate buffers; a flat material packs the face normal into the
 * texcoord. Faces stay opaque (depth-writing). Without the lit shader both draw unlit.
 *
 * Cells are bucketed into materials by TileType id; an unmatched or id-less cell takes the
 * default material. The layer is VBO-cached in absolute world px: call markDirty() after any
 * tile edit.
 * @implements {RenderPass}
 */
globalThis.RenderWalls = class RenderWalls {
  /**
   * `layer`: only `get(gx, gy)` is read (truthy cell = wall), so any occupancy view satisfies
   * it. opt: `sprite` is an asset ref; `materials` buckets cells by TileType id, the top-level
   * sprite/frame/color being the default bucket.
   */
  constructor(grid, layer, opt) {
    opt = opt ?? {};
    this.enabled = true;
    this.grid = grid;
    this.layer = layer;
    this.height = opt.height ?? 32; // world px, visual only
    this.lights = opt.lights; // the lit host pass, whose shader and light gather the walls share
    // [0] is the catch-all; a bucket with a missing sprite degrades to flat tint alone
    this._mats = [
      {
        sprite: opt.sprite,
        frame: opt.frame ?? 0,
        color: opt.color ?? c_white,
        texOk: opt.sprite !== undefined && sprite_exists(opt.sprite),
      },
    ];
    this._matIndex = {}; // TileType id (string key) -> _mats index; misses fall to 0
    const mats = opt.materials ?? [];
    for (let i = 0; i < mats.length; i++) {
      const m = mats[i];
      this._matIndex["" + m.id] = this._mats.length;
      this._mats.push({
        sprite: m.sprite,
        frame: m.frame ?? 0,
        color: m.color ?? c_white,
        texOk: m.sprite !== undefined && sprite_exists(m.sprite),
      });
    }
    // 24 B/vertex, in lockstep with the mesh vertex layout
    vertex_format_begin();
    vertex_format_add_position_3d();
    vertex_format_add_colour();
    vertex_format_add_texcoord();
    this._format = vertex_format_end();
    this._vbTops = []; // per-bucket top quads; textured mode submits under normal (0,0,-1)
    this._vbSouths = []; // per-bucket exposed south quads; textured normal (0,1,0)
    for (let i = 0; i < this._mats.length; i++) {
      this._vbTops.push(-1);
      this._vbSouths.push(-1);
    }
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
    for (let i = 0; i < this._mats.length; i++) {
      if (this._vbTops[i] !== -1) vertex_delete_buffer(this._vbTops[i]);
      if (this._vbSouths[i] !== -1) vertex_delete_buffer(this._vbSouths[i]);
      this._vbTops[i] = -1;
      this._vbSouths[i] = -1;
    }
  }

  /** A cell's material bucket; a bare truthy cell has no id and takes the default. */
  _bucketOf(t) {
    const tid = typeof t === "object" ? t.id : t;
    const mi = this._matIndex["" + tid];
    return mi === undefined ? 0 : mi;
  }

  /**
   * Rebuild the per-bucket VBOs, counted first for exact fixed buffers (byte order: 3×f32 pos,
   * R,G,B,A u8, 2×f32 texcoord).
   * An empty bucket stays -1 (vertex_create_buffer_from_buffer can't take a 0-byte buffer).
   */
  _rebuild() {
    this._dirty = false;
    this._free();
    const cols = this.grid.cols;
    const rows = this.grid.rows;
    const n = this._mats.length;
    const tops = [];
    const souths = [];
    let total = 0;
    while (tops.length < n) {
      tops.push(0);
      souths.push(0);
    }
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const t = this.layer.get(gx, gy);
        if (!t) continue;
        const mi = this._bucketOf(t);
        tops[mi]++;
        total++;
        if (!this.layer.get(gx, gy + 1)) souths[mi]++; // exposed south face only
      }
    }
    if (total === 0) return;

    // textured mode stretches the frame's UV rect over each face, trim ignored (a full-bleed
    // tile texture is never trimmed); flat mode packs the face normals instead
    const bufT = [];
    const bufS = [];
    const U0 = [];
    const V0 = [];
    const U1 = [];
    const V1 = [];
    const SV0 = [];
    const SV1 = [];
    const R = [];
    const G = [];
    const B = [];
    for (let i = 0; i < n; i++) {
      const m = this._mats[i];
      bufT.push(
        tops[i] > 0 ? buffer_create(tops[i] * 6 * 24, buffer_fixed, 1) : -1,
      );
      bufS.push(
        souths[i] > 0 ? buffer_create(souths[i] * 6 * 24, buffer_fixed, 1) : -1,
      );
      const uv = m.texOk ? sprite_get_uvs(m.sprite, m.frame) : [0, 0, 0, 0];
      U0.push(uv[0]);
      V0.push(uv[1]);
      U1.push(m.texOk ? uv[2] : 0);
      V1.push(m.texOk ? uv[3] : 0);
      // flat mode packs the SOUTH normal (0,1) into the south quads' texcoord; textured mode
      // reuses the same UV rect on both faces (dedicated top/side textures are the art seam)
      SV0.push(m.texOk ? uv[1] : 1);
      SV1.push(m.texOk ? uv[3] : 1);
      R.push(color_get_red(m.color));
      G.push(color_get_green(m.color));
      B.push(color_get_blue(m.color));
    }
    const vert = (buf, mi, x, y, z, u, v) => {
      buffer_write(buf, buffer_f32, x);
      buffer_write(buf, buffer_f32, y);
      buffer_write(buf, buffer_f32, z);
      buffer_write(buf, buffer_u8, R[mi]);
      buffer_write(buf, buffer_u8, G[mi]);
      buffer_write(buf, buffer_u8, B[mi]);
      buffer_write(buf, buffer_u8, 255);
      buffer_write(buf, buffer_f32, u);
      buffer_write(buf, buffer_f32, v);
    };
    const cw = this.grid.cellWidth;
    const ch = this.grid.cellHeight;
    const H = this.height;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const t = this.layer.get(gx, gy);
        if (!t) continue;
        const mi = this._bucketOf(t);
        const x0 = gx * cw;
        const y0 = gy * ch;
        const x1 = x0 + cw;
        const y1 = y0 + ch;
        // TOP quad lying flat at -H (up = -z)
        const bt = bufT[mi];
        vert(bt, mi, x0, y0, -H, U0[mi], V0[mi]);
        vert(bt, mi, x1, y0, -H, U1[mi], V0[mi]);
        vert(bt, mi, x1, y1, -H, U1[mi], V1[mi]);
        vert(bt, mi, x0, y0, -H, U0[mi], V0[mi]);
        vert(bt, mi, x1, y1, -H, U1[mi], V1[mi]);
        vert(bt, mi, x0, y1, -H, U0[mi], V1[mi]);
        // SOUTH face at y1, top edge shared with the TOP quad (no seam)
        if (!this.layer.get(gx, gy + 1)) {
          const bs = bufS[mi];
          vert(bs, mi, x0, y1, -H, U0[mi], SV0[mi]);
          vert(bs, mi, x1, y1, -H, U1[mi], SV0[mi]);
          vert(bs, mi, x1, y1, 0, U1[mi], SV1[mi]);
          vert(bs, mi, x0, y1, -H, U0[mi], SV0[mi]);
          vert(bs, mi, x1, y1, 0, U1[mi], SV1[mi]);
          vert(bs, mi, x0, y1, 0, U0[mi], SV1[mi]);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (bufT[i] !== -1) {
        this._vbTops[i] = vertex_create_buffer_from_buffer(
          bufT[i],
          this._format,
        );
        buffer_delete(bufT[i]);
        vertex_freeze(this._vbTops[i]);
      }
      if (bufS[i] !== -1) {
        this._vbSouths[i] = vertex_create_buffer_from_buffer(
          bufS[i],
          this._format,
        );
        buffer_delete(bufS[i]);
        vertex_freeze(this._vbSouths[i]);
      }
    }
  }

  /**
   * submit one bucket's buffer under its mode (textured: real UVs + per-orientation u_normal
   * already set by the caller; flat: packed-normal vox mode).
   */
  _submit(vb, m, lit) {
    if (vb === -1) return;
    if (m.texOk) {
      if (lit) shader_set_uniform_f(this.lights.uUseTex, 1);
      vertex_submit(vb, pr_trianglelist, sprite_get_texture(m.sprite, m.frame));
    } else {
      if (lit) shader_set_uniform_f(this.lights.uUseTex, 0);
      vertex_submit(vb, pr_trianglelist, -1);
    }
  }

  draw(entities) {
    if (this._dirty) this._rebuild();
    let any = false;
    for (let i = 0; i < this._mats.length; i++)
      if (this._vbTops[i] !== -1) any = true;
    if (!any) return;
    // depth-writing; the global default is off
    gpu_set_zwriteenable(true);
    const lit = this.lights !== undefined && this.lights.litOk;
    if (lit) this.lights.setupLights(entities); // sets shMeshlit + sun/point uniforms (u_useTex 0)
    // all tops under normal (0,0,-1), then all souths under (0,1,0) — one normal set per
    // orientation; flat buckets ignore u_normal (their normals ride the packed texcoord).
    if (lit) shader_set_uniform_f(this.lights.uNormal, 0, 0, -1);
    for (let i = 0; i < this._mats.length; i++)
      this._submit(this._vbTops[i], this._mats[i], lit);
    if (lit) shader_set_uniform_f(this.lights.uNormal, 0, 1, 0);
    for (let i = 0; i < this._mats.length; i++)
      this._submit(this._vbSouths[i], this._mats[i], lit);
    if (lit) shader_reset();
    gpu_set_zwriteenable(false);
  }
};
