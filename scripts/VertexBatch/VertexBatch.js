/**
 * A vertex buffer paired with the one texture page every quad in it samples. The pairing is the
 * batch's invariant, not the caller's memory: `uvs` pins the batch to a frame's page on the
 * first read and throws on a frame from another page, since a sprite can straddle pages and a
 * buffer submitted under one page would silently sample the other's texels. `submit()` takes no
 * texture: it is the pinned page's. A pass that hears the throw splits its quads into one batch
 * per page. Owns a native handle; destroy it.
 */
globalThis.VertexBatch = class VertexBatch {
  constructor() {
    this._vb = new VertexBuffer();
    this._tex = undefined; // the pinned page's texture
    this.page = -1; // the pinned page index; -1 unpinned
    this.count = 0; // quads added since begin
    // BUG: per-sprite page tables in parallel arrays, since a Map keyed by an asset ref
    // crashes (docs/GMRT.md)
    this._sprites = [];
    this._pages = [];
  }

  begin() {
    this._vb.begin();
    this._tex = undefined;
    this.page = -1;
    this.count = 0;
    this._sprites.length = 0;
    this._pages.length = 0;
    return this;
  }

  /**
   * Reads each sprite's page table once per build. BUG: the nested array reaches JS opaque, so
   * it is walked with array_length/array_get (docs/GMRT.md).
   */
  _pageOf(sprite, frame) {
    let i = 0;
    while (i < this._sprites.length) {
      if (this._sprites[i] === sprite) return this._pages[i][frame];
      i++;
    }
    const frames = sprite_get_info(sprite).frames;
    const n = array_length(frames);
    const pages = new Array(n);
    for (let k = 0; k < n; k++) pages[k] = array_get(frames, k).texture;
    this._sprites.push(sprite);
    this._pages.push(pages);
    return pages[frame];
  }

  /**
   * `sprite_get_uvs` for a quad of this batch. The first read pins the batch to the frame's
   * page; a later read off another page throws.
   */
  uvs(sprite, frame) {
    const page = this._pageOf(sprite, frame);
    if (this.page === -1) {
      this.page = page;
      this._tex = sprite_get_texture(sprite, frame);
    } else if (page !== this.page) {
      throw new Error(
        "VertexBatch: " +
          sprite_get_name(sprite) +
          "[" +
          frame +
          "] is on texture page " +
          page +
          ", the batch on " +
          this.page,
      );
    }
    return sprite_get_uvs(sprite, frame);
  }

  /**
   * The trimmed rect is scaled into (x, y, w, h), so a cropped frame does not stretch to fill it.
   */
  addFrame(sprite, frame, x, y, w, h, color = c_white, alpha = 1) {
    const uv = this.uvs(sprite, frame);
    const sw = sprite_get_width(sprite);
    const sh = sprite_get_height(sprite);
    this._vb.addQuad(
      x + uv[4] * (w / sw),
      y + uv[5] * (h / sh),
      w * uv[6],
      h * uv[7],
      uv[0],
      uv[1],
      uv[2],
      uv[3],
      color,
      alpha,
    );
    this.count++;
    return this;
  }

  /** UVs must come through `uvs`. */
  addQuad(x, y, w, h, u0, v0, u1, v1, color = c_white, alpha = 1) {
    this._vb.addQuad(x, y, w, h, u0, v0, u1, v1, color, alpha);
    this.count++;
    return this;
  }

  /** UVs must come through `uvs`. */
  addUpright(x, y, z0, w, h, u0, v0, u1, v1, color = c_white, alpha = 1) {
    this._vb.addUpright(x, y, z0, w, h, u0, v0, u1, v1, color, alpha);
    this.count++;
    return this;
  }

  end(freeze = true) {
    this._vb.end(freeze);
    return this;
  }

  /** An unpinned batch holds no quad and submits nothing. */
  submit() {
    if (this.page !== -1) this._vb.submit(this._tex);
    return this;
  }

  destroy() {
    this._vb.destroy();
    this._vb = undefined;
  }
};
