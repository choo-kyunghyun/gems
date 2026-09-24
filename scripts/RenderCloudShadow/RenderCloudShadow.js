/**
 * Drifting cloud shadows: a sky-overlay layer whose coverage follows the weather, scaled by
 * daylight. A seamless noise tile, baked once, is drawn as one quad over the visible ground and
 * drifts on sim time, so clouds freeze on pause.
 *
 * The field bakes density into alpha and the quad draws black, so under normal blend a texel
 * darkens by density × strength; unlike a multiply, that composes on a transparent overlay
 * surface.
 * @implements {RenderPass}
 */
globalThis.RenderCloudShadow = class RenderCloudShadow {
  constructor(opt = {}) {
    this.enabled = true;
    this.camera = opt.camera;
    this.darkness = opt.darkness ?? 0.38; // at full coverage and full sun
    this.windX = opt.windX ?? -22; // world px/s
    this.windY = opt.windY ?? 8;
    this.seed = opt.seed ?? 1337;
    this.texWorld = opt.texWorld ?? 1800; // world px one noise tile spans
    this._n = 256; // power of two so every octave wraps
    this._vb = new VertexBuffer();
    this._buf = -1; // outlives the volatile surface, to re-upload it
    this._surf = -1;
  }

  destroy() {
    if (this._vb !== undefined) this._vb.destroy();
    if (surface_exists(this._surf)) surface_free(this._surf);
    if (buffer_exists(this._buf)) buffer_delete(this._buf);
  }

  draw(_entities) {
    if (this.camera === undefined) return;

    // Tint alpha reaches 0.5 by nightfall, so shadows fade out before the night tint lands.
    const blend = Weather.blend();
    const cover =
      Weather.previous().cloud * (1 - blend) + Weather.current().cloud * blend;
    const sun = 1 - Math.min(1, Daylight.tint().alpha * 2);
    const eff = Math.min(0.95, this.darkness * sun * cover);
    if (eff <= 0.02) return;

    const sw = surface_get_width(application_surface);
    const sh = surface_get_height(application_surface);
    if (!(sw > 0)) return; // NaN-safe (NaN > 0 is false)

    const tex = this._texture();

    // The pitched ortho is affine, so the ground has no horizon singularity. The pad keeps
    // drift from uncovering an edge.
    const c0 = this.camera.unproject(0, 0);
    const c1 = this.camera.unproject(sw, 0);
    const c2 = this.camera.unproject(0, sh);
    const c3 = this.camera.unproject(sw, sh);
    const pad = this.texWorld * 0.1;
    const x0 = Math.min(c0.x, c1.x, c2.x, c3.x) - pad;
    const x1 = Math.max(c0.x, c1.x, c2.x, c3.x) + pad;
    const y0 = Math.min(c0.y, c1.y, c2.y, c3.y) - pad;
    const y1 = Math.max(c0.y, c1.y, c2.y, c3.y) + pad;

    const t = Weather.time();
    const s = this.texWorld;
    const u0 = (x0 + this.windX * t) / s;
    const u1 = (x1 + this.windX * t) / s;
    const v0 = (y0 + this.windY * t) / s;
    const v1 = (y1 + this.windY * t) / s;

    // two corners suffice under the pitch-only ortho
    const p0 = this.camera.project(x0, y0, 0);
    const p1 = this.camera.project(x1, y1, 0);

    gpu_set_tex_repeat(true);
    gpu_set_tex_filter(true); // magnified texels of a soft field must interpolate
    this._vb
      .begin()
      .addQuad(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y, u0, v0, u1, v1, c_black, eff)
      .end(false)
      .submit(tex);
    gpu_set_tex_filter(false);
    gpu_set_tex_repeat(false);
  }

  /** The density texture, baked once; a lost surface is recreated from the buffer. */
  _texture() {
    if (this._buf === -1) this._buf = this._bake();
    if (!surface_exists(this._surf)) {
      this._surf = surface_create(this._n, this._n);
      buffer_set_surface(this._buf, this._surf, 0);
    }
    return surface_get_texture(this._surf);
  }

  /** A smooth threshold makes the field soft patches with clear gaps, not uniform dapple. */
  _bake() {
    const n = this._n;
    const buf = buffer_create(n * n * 4, buffer_fixed, 1);
    const octaves = 5;
    const base = 4; // lattice cells across the tile at octave 0
    const freq = [];
    const amp = [];
    let amax = 0;
    for (let o = 0; o < octaves; o++) {
      freq.push(base * Math.pow(2, o));
      const a = Math.pow(0.5, o);
      amp.push(a);
      amax += a;
    }
    for (let py = 0; py < n; py++)
      for (let px = 0; px < n; px++) {
        let v = 0;
        for (let o = 0; o < octaves; o++) {
          const f = freq[o];
          v +=
            amp[o] *
            this._pnoise((px / n) * f, (py / n) * f, f, this.seed + o * 97);
        }
        v = v / amax;
        let d = (v - 0.52) / 0.3;
        d = d < 0 ? 0 : d > 1 ? 1 : d;
        d = d * d * (3 - 2 * d);
        const g = Math.floor(d * 255);
        buffer_write(buf, buffer_u8, 255);
        buffer_write(buf, buffer_u8, 255);
        buffer_write(buf, buffer_u8, 255);
        buffer_write(buf, buffer_u8, g);
      }
    return buf;
  }

  /** Value noise in [0,1) whose lattice wraps at `period`, so the tile is seamless. */
  _pnoise(fx, fy, period, seed) {
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    let tx = fx - ix;
    let ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    const x0 = ((ix % period) + period) % period;
    const y0 = ((iy % period) + period) % period;
    const x1 = (x0 + 1) % period;
    const y1 = (y0 + 1) % period;
    const v00 = hash2(x0, y0, seed);
    const v10 = hash2(x1, y0, seed);
    const v01 = hash2(x0, y1, seed);
    const v11 = hash2(x1, y1, seed);
    const a = v00 + (v10 - v00) * tx;
    const b = v01 + (v11 - v01) * tx;
    return a + (b - a) * ty;
  }
};
