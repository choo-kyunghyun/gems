/**
 * WALLS pass of the art projection contract (RenderBillboard): draws a solid tile
 * layer as lit boxes. Per wall cell it emits a plan-view TOP quad (at -height) plus a
 * vertical SOUTH face only where the south neighbor is empty — the two orientations the
 * fixed-yaw pitched camera can ever see (the Vox contract). Hidden-face removal happens
 * HERE at build time; no emitted face can backface a fixed-yaw camera, so GPU cull modes
 * would have nothing left to remove.
 *
 * Vertices are the Vox 24 B/vertex format (position_3d + colour + texcoord), in one of
 * two shMeshlit modes (both share the sun + view-culled point lights supplied by the host
 * RenderMesh pass, `opt.lights`, whose setupLights runs before the submits — walls join the
 * same depth pool as furniture and billboards, z-write on for the submit):
 * - TEXTURED (sprite set): texcoord = real frame UVs, colour = the material tint
 *   (texture × tint × light — grayscale-ish pattern textures let one texture serve every
 *   material color), and the face normal rides the u_normal UNIFORM — constant per
 *   orientation, so the pass keeps tops and souths in separate buffers and submits each
 *   under its own normal (u_useTex = 1). Faces must stay opaque (depth-writing geometry).
 * - FLAT TINT (no sprite): texcoord = the PACKED face normal (top (0,0), south (0,1)),
 *   colour = the tint — the vox mode, u_useTex = 0. Also the sprite-missing fallback.
 * Without the shader (or no host pass) both modes submit fixed-function: textured × colour
 * or flat colour, unlit — same degradation as RenderMesh.
 *
 * PER-CELL MATERIALS (opt.materials): cells are bucketed by their TileType id, each bucket
 * a { sprite, frame, color } of its own — one solid layer renders brick/concrete/metal/plank
 * side by side while colliders/nav stay occupancy-based (one TileEdit layer). A cell whose
 * id matches no material — including a bare-occupancy view whose get() returns booleans/1s
 * without a TileType — falls to the DEFAULT bucket (opt.sprite/opt.color). Without
 * opt.materials everything is the default bucket (the original single-material behavior).
 *
 * VBO-cached like RenderTileMap: call markDirty() after any tile edit — BuildMode's
 * _markTileDirty reaches it through scene._tilePasses. Coords are absolute world px, so the
 * draw needs no world matrix and a whole-layer rebuild is one pass over the grid.
 * @implements {RenderPass}
 */
globalThis.RenderWalls = class RenderWalls {
  /**
   * `layer`: only `get(gx, gy)` is read (truthy cell = wall), so any occupancy view satisfies
   * it, not just a TileLayer. opt: `sprite` is an asset REF (validated via sprite_exists —
   * asset_get_index refs never compare >= 0 on GMRT); `frame` picks the subimage (default 0);
   * `materials` buckets cells by TileType id (see the class doc), id-less/unmatched cells
   * using the top-level defaults.
   */
  constructor(grid, layer, opt) {
    opt = opt ?? {};
    this.enabled = true;
    this.grid = grid;
    this.layer = layer;
    this.height = opt.height ?? 32; // wall height in world px (visual only — colliders are TileEdit's)
    this.lights = opt.lights; // host RenderMesh pass (shares shMeshlit + its light gather)
    // normalized material buckets: [0] = the default/catch-all, then each opt.materials entry.
    // texOk resolved per bucket (a bucket with a missing sprite degrades to flat tint alone).
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
    // same 24 B/vertex declaration as RenderMesh._format — the lockstep Vox layout
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

  /**
   * material bucket for a cell value: a TileType keys by id, a bare-occupancy truthy (1/true)
   * has none — both fall to bucket 0 (the default) on a miss.
   */
  _bucketOf(t) {
    const tid = typeof t === "object" ? t.id : t;
    const mi = this._matIndex["" + tid];
    return mi === undefined ? 0 : mi;
  }

  /**
   * rebuild the per-bucket whole-layer VBOs: count quads per bucket for exact fixed buffers,
   * then write vertices (byte order per Vox: 3×f32 pos, R,G,B,A u8, 2×f32 texcoord).
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

    // per-bucket write state: buffers + UVs + tint (textured mode: the frame's texture-page
    // UV rect stretched over each face, trim insets [4..7] ignored — a full-bleed tile
    // texture is never trimmed; flat mode: packed face normals shMeshlit's vox path decodes)
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
    // depth-writing like RenderMesh/RenderBillboard (global default is off)
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
