/**
 * vertex-buffer wrapper, fixed position+texcoord+colour format. build via begin → addQuad → end,
 * submit(texture) each frame. backs RenderTileMap. owns a native handle — destroy it.
 */
globalThis.VertexBuffer = class VertexBuffer {
  static _fmt = undefined;

  // shared vertex format, built once on first use
  static _format() {
    if (VertexBuffer._fmt === undefined) {
      vertex_format_begin();
      vertex_format_add_position();
      vertex_format_add_texcoord();
      vertex_format_add_colour();
      VertexBuffer._fmt = vertex_format_end();
    }
    return VertexBuffer._fmt;
  }

  constructor() {
    this._buf = vertex_create_buffer();
  }

  /** start a fresh batch (clears prior vertices). @returns {VertexBuffer} this */
  begin() {
    vertex_begin(this._buf, VertexBuffer._format());
    return this;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} u0
   * @param {number} v0
   * @param {number} u1
   * @param {number} v1
   * @param {number} [color]
   * @param {number} [alpha]
   */
  addQuad(x, y, w, h, u0, v0, u1, v1, color = c_white, alpha = 1) {
    const b = this._buf;
    vertex_position(b, x, y);         vertex_texcoord(b, u0, v0); vertex_colour(b, color, alpha);
    vertex_position(b, x + w, y);     vertex_texcoord(b, u1, v0); vertex_colour(b, color, alpha);
    vertex_position(b, x, y + h);     vertex_texcoord(b, u0, v1); vertex_colour(b, color, alpha);
    vertex_position(b, x + w, y);     vertex_texcoord(b, u1, v0); vertex_colour(b, color, alpha);
    vertex_position(b, x + w, y + h); vertex_texcoord(b, u1, v1); vertex_colour(b, color, alpha);
    vertex_position(b, x, y + h);     vertex_texcoord(b, u0, v1); vertex_colour(b, color, alpha);
    return this;
  }

  /**
   * per-vertex alpha quad. corner order: TL, TR, BL, BR.
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {number} u0
   * @param {number} v0
   * @param {number} u1
   * @param {number} v1
   * @param {number} color
   * @param {number} aTL
   * @param {number} aTR
   * @param {number} aBL
   * @param {number} aBR
   */
  addQuadV(x, y, w, h, u0, v0, u1, v1, color, aTL, aTR, aBL, aBR) {
    const b = this._buf;
    vertex_position(b, x, y);         vertex_texcoord(b, u0, v0); vertex_colour(b, color, aTL);
    vertex_position(b, x + w, y);     vertex_texcoord(b, u1, v0); vertex_colour(b, color, aTR);
    vertex_position(b, x, y + h);     vertex_texcoord(b, u0, v1); vertex_colour(b, color, aBL);
    vertex_position(b, x + w, y);     vertex_texcoord(b, u1, v0); vertex_colour(b, color, aTR);
    vertex_position(b, x + w, y + h); vertex_texcoord(b, u1, v1); vertex_colour(b, color, aBR);
    vertex_position(b, x, y + h);     vertex_texcoord(b, u0, v1); vertex_colour(b, color, aBL);
    return this;
  }

  /** finish the batch; `freeze` uploads to VRAM for static meshes. @param {boolean} [freeze] @returns {VertexBuffer} this */
  end(freeze = true) {
    vertex_end(this._buf);
    if (freeze) vertex_freeze(this._buf);
    return this;
  }

  /** draw the batch as a triangle list. @param {*} texture the texture page handle @returns {VertexBuffer} this */
  submit(texture) {
    vertex_submit(this._buf, pr_trianglelist, texture);
    return this;
  }

  /** free the native vertex buffer. */
  destroy() {
    vertex_delete_buffer(this._buf);
    this._buf = undefined;
  }
};
