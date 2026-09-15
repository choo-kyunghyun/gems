/**
 * A VertexBuffer paired with the one texture page every quad in it samples. The pairing is the
 * batch's invariant, not the caller's memory: `uvs(sprite, frame)` is how a frame's UVs reach a
 * quad, and it pins the batch to that frame's page on the first read and throws on a frame from
 * another page — the packer places frames one by one, so a sprite (or a pair of sprites) can
 * straddle pages once its group overflows, and a buffer submitted under one page would sample the
 * other's texels with no error. `submit()` takes no texture: it is the pinned page's. A pass that
 * hears the throw splits its quads into one batch per page.
 * Backs RenderTileMap + RenderGrass; RenderCloudShadow samples its own surface and stays on
 * VertexBuffer. Owns a native handle — destroy it.
 */
globalThis.VertexBatch = class VertexBatch {
  constructor() {
    this._vb = new VertexBuffer();
    this._tex = undefined; // the pinned page's texture, off the first frame read
    this.page = -1; // the pinned page index (sprite_get_info's frames[i].texture); -1 unpinned
    this.count = 0; // quads added since begin
    // the page table of every sprite read this build — parallel arrays scanned by ===, since a
    // Map keyed by an asset ref crashes GMRT (docs/GMRT.md)
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
   * The page index of a frame, off a per-sprite table read once per build; the struct's nested
   * array reaches JS opaque, so it is walked with array_length/array_get (docs/GMRT.md).
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
   * `sprite_get_uvs(sprite, frame)` — [u0, v0, u1, v1, trimX, trimY, wRatio, hRatio] — for a quad
   * of this batch: the first read pins the batch to the frame's page and texture, a later read
   * off another page throws.
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
   * `frame` of `sprite` drawn into the rect (x, y, w, h): the packer-trimmed rect scaled into it
   * (trim data [4..7]), so a cropped frame does not stretch to fill the rect — an untrimmed frame
   * reduces to the full rect.
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

  /** A raw quad over UVs read through `uvs` (VertexBuffer.addQuad). */
  addQuad(x, y, w, h, u0, v0, u1, v1, color = c_white, alpha = 1) {
    this._vb.addQuad(x, y, w, h, u0, v0, u1, v1, color, alpha);
    this.count++;
    return this;
  }

  /** A raw upright quad over UVs read through `uvs` (VertexBuffer.addUpright). */
  addUpright(x, y, z0, w, h, u0, v0, u1, v1, color = c_white, alpha = 1) {
    this._vb.addUpright(x, y, z0, w, h, u0, v0, u1, v1, color, alpha);
    this.count++;
    return this;
  }

  end(freeze = true) {
    this._vb.end(freeze);
    return this;
  }

  /** Submit under the pinned page; an unpinned batch holds no quad and submits nothing. */
  submit() {
    if (this.page !== -1) this._vb.submit(this._tex);
    return this;
  }

  destroy() {
    this._vb.destroy();
    this._vb = undefined;
  }
};
