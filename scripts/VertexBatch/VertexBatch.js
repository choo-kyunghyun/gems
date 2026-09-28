/**
 * Quads sorted by the texture page they sample: one vertex buffer per page, since a sprite can
 * straddle pages and a buffer submitted under one page would silently sample the other's texels.
 * `uvs` routes the quads that follow to its frame's page, so the pairing is the batch's
 * invariant, not the caller's memory; `submit()` draws each page's buffer under that page. Owns
 * native handles; destroy it.
 */
globalThis.VertexBatch = class VertexBatch {
  constructor() {
    this.count = 0; // quads added since begin
    // per page: its index, its texture, its buffer
    this._pages = [];
    this._texs = [];
    this._vbs = [];
    this._vb = undefined; // the buffer the next quads land in
    // BUG: per-sprite page and UV tables in parallel arrays, since a Map keyed by an asset ref
    // crashes (docs/GMRT.md)
    this._sprites = [];
    this._pageTabs = [];
    this._uvTabs = [];
  }

  begin() {
    this._free();
    this.count = 0;
    this._sprites.length = 0;
    this._pageTabs.length = 0;
    this._uvTabs.length = 0;
    return this;
  }

  /**
   * The sprite's slot in the per-build tables. BUG: the nested frames array reaches JS opaque,
   * so it is walked with array_length/array_get (docs/GMRT.md).
   */
  _slot(sprite) {
    let i = 0;
    while (i < this._sprites.length) {
      if (this._sprites[i] === sprite) return i;
      i++;
    }
    const frames = sprite_get_info(sprite).frames;
    const n = array_length(frames);
    const pages = new Array(n);
    for (let k = 0; k < n; k++) pages[k] = array_get(frames, k).texture;
    this._sprites.push(sprite);
    this._pageTabs.push(pages);
    this._uvTabs.push(new Array(n));
    return i;
  }

  /** `sprite_get_uvs` for a quad of this batch; the quads that follow land on the frame's page. */
  uvs(sprite, frame) {
    const i = this._slot(sprite);
    const page = this._pageTabs[i][frame];
    let p = 0;
    while (p < this._pages.length && this._pages[p] !== page) p++;
    if (p === this._pages.length) {
      this._pages.push(page);
      this._texs.push(sprite_get_texture(sprite, frame));
      this._vbs.push(new VertexBuffer().begin());
    }
    this._vb = this._vbs[p];
    let uv = this._uvTabs[i][frame];
    if (uv === undefined) {
      uv = sprite_get_uvs(sprite, frame);
      this._uvTabs[i][frame] = uv;
    }
    return uv;
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

  /** UVs must come through `uvs`, which picks the page the quad lands on. */
  addQuad(x, y, w, h, u0, v0, u1, v1, color = c_white, alpha = 1) {
    this._vb.addQuad(x, y, w, h, u0, v0, u1, v1, color, alpha);
    this.count++;
    return this;
  }

  /** UVs must come through `uvs`, which picks the page the quad lands on. */
  addUpright(x, y, z0, w, h, u0, v0, u1, v1, color = c_white, alpha = 1) {
    this._vb.addUpright(x, y, z0, w, h, u0, v0, u1, v1, color, alpha);
    this.count++;
    return this;
  }

  end(freeze = true) {
    for (let p = 0; p < this._vbs.length; p++) this._vbs[p].end(freeze);
    return this;
  }

  /** A batch with no quad submits nothing. */
  submit() {
    for (let p = 0; p < this._vbs.length; p++) this._vbs[p].submit(this._texs[p]);
    return this;
  }

  destroy() {
    this._free();
  }

  _free() {
    for (let p = 0; p < this._vbs.length; p++) this._vbs[p].destroy();
    this._pages.length = 0;
    this._texs.length = 0;
    this._vbs.length = 0;
    this._vb = undefined;
  }
};
