// Drifting cloud shadows (Demo) — soft dark patches sliding over the ground. Coverage follows the
// current Weather condition (each _COND carries a `cloud` fraction, cross-faded by Weather.blend())
// and is scaled by daylight (WorldClock.tint alpha — no sun, no shadows, so the pass is gone by
// nightfall and the night tint never double-darkens).
//
// A seamless value-noise texture (baked ONCE into a surface from the shared Utils.hash2 on a
// PERIODIC lattice, so it tiles) is drawn as ONE world-space quad on the ground plane (z=0) via a
// VertexBuffer under the LIVE camera matrices — so the field foreshortens with the pitched 2.5D
// camera (a screen-space overlay would not). UVs come from world position + wind*time drift,
// wrapped (gpu_set_tex_repeat), so the field tiles across the whole world and scrolls; drift runs
// on Weather.time() (cumulative SIM seconds), so clouds freeze on pause and race under Time.scale.
//
// Blend: gpu_set_blendmode_ext(bm_zero, bm_inv_src_colour) → dst*(1 - src), a fade-able multiply
// darken with src = texel density × the grey strength colour. At density 0 (clear sky) or strength
// 0 (night / no coverage) src is 0, so the ground is untouched — the field fades in/out smoothly.
// Depth test off so the shadow lands on entities too; ground passes keep z-write off already.
//
// Inserted just BEFORE RenderWeather in RpgMap.build (outdoor maps only — meta.indoor skips it).

// @implements {RenderPass}
globalThis.RenderCloudShadow = class RenderCloudShadow {
  constructor(opt = {}) {
    this.enabled = true;
    this.camera = opt.camera; // a Camera instance; assigned by RpgMap.build
    this.darkness = opt.darkness ?? 0.38; // core darkening at full coverage + full sun
    this.windX = opt.windX ?? -22; // drift, world px/s — leftward like the rain's slant
    this.windY = opt.windY ?? 8;
    this.seed = opt.seed ?? 1337; // noise-field layout seed (fixed — the DRIFT animates, not the field)
    this.texWorld = opt.texWorld ?? 1800; // world px one noise tile spans (soft-patch scale)
    this._n = 256; // noise texture resolution (px, power of two so every octave wraps)
    this._vb = new VertexBuffer();
    this._buf = -1; // baked RGBA density (persistent; re-uploaded if the volatile surface is lost)
    this._surf = -1;
  }

  destroy() {
    if (this._vb !== undefined) this._vb.destroy();
    if (surface_exists(this._surf)) surface_free(this._surf);
    if (buffer_exists(this._buf)) buffer_delete(this._buf);
  }

  draw(_entities) {
    if (this.camera === undefined) return;

    // strength: weather coverage (cross-faded) × daylight, folded into one grey the blend darkens
    // by. tint alpha is 0 in full daylight and ≥ 0.5 from nightfall, so shadows fade out before
    // the night tint lands.
    const blend = Weather.blend();
    const cover =
      Weather.previous().cloud * (1 - blend) + Weather.current().cloud * blend;
    const sun = 1 - Math.min(1, WorldClock.tint().alpha * 2);
    const eff = Math.min(0.95, this.darkness * sun * cover);
    if (eff <= 0.02) return;

    const sw = surface_get_width(application_surface);
    const sh = surface_get_height(application_surface);
    if (!(sw > 0)) return; // NaN-safe (NaN > 0 is false)

    const tex = this._texture();

    // Visible ground AABB: unproject the four screen corners (pitched ORTHO is affine, so the
    // ground plane has no horizon singularity). Pad by a fraction of a tile so drift never
    // uncovers an edge.
    const c0 = this.camera.unproject(0, 0);
    const c1 = this.camera.unproject(sw, 0);
    const c2 = this.camera.unproject(0, sh);
    const c3 = this.camera.unproject(sw, sh);
    const pad = this.texWorld * 0.1;
    const x0 = Math.min(c0.x, c1.x, c2.x, c3.x) - pad;
    const x1 = Math.max(c0.x, c1.x, c2.x, c3.x) + pad;
    const y0 = Math.min(c0.y, c1.y, c2.y, c3.y) - pad;
    const y1 = Math.max(c0.y, c1.y, c2.y, c3.y) + pad;

    // world → texture UVs (+ drift); tex_repeat wraps the [0,1] tile across the whole rect
    const t = Weather.time();
    const s = this.texWorld;
    const u0 = (x0 + this.windX * t) / s;
    const u1 = (x1 + this.windX * t) / s;
    const v0 = (y0 + this.windY * t) / s;
    const v1 = (y1 + this.windY * t) / s;

    const gv = Math.floor(eff * 255); // grey strength: src = texel density × this
    const grey = make_colour_rgb(gv, gv, gv);

    gpu_set_ztestenable(false);
    gpu_set_tex_repeat(true);
    gpu_set_tex_filter(true); // bilinear: the field is soft, so magnified texels must interpolate
    gpu_set_blendmode_ext(bm_zero, bm_inv_src_colour);
    this._vb
      .begin()
      .addQuad(x0, y0, x1 - x0, y1 - y0, u0, v0, u1, v1, grey, 1)
      .end(false)
      .submit(tex);
    gpu_set_blendmode(bm_normal);
    gpu_set_tex_filter(false);
    gpu_set_tex_repeat(false);
    gpu_set_ztestenable(true);
  }

  // The density texture, baked once; recreate the surface (not the buffer) if the volatile surface
  // was lost. Returns the texture handle for the quad submit.
  _texture() {
    if (this._buf === -1) this._buf = this._bake();
    if (!surface_exists(this._surf)) {
      this._surf = surface_create(this._n, this._n);
      buffer_set_surface(this._buf, this._surf, 0);
    }
    return surface_get_texture(this._surf);
  }

  // Bake the seamless cloud-density field into an RGBA buffer (grey = density, alpha = 255). fbm of
  // periodic value noise (each octave wraps at its own frequency → the tile is seamless), then a
  // smooth threshold so the field is soft PATCHES with clear gaps, not uniform dapple.
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
        let d = (v - 0.52) / 0.3; // threshold → soft patches (gaps stay clear)
        d = d < 0 ? 0 : d > 1 ? 1 : d;
        d = d * d * (3 - 2 * d);
        const g = Math.floor(d * 255);
        buffer_write(buf, buffer_u8, g);
        buffer_write(buf, buffer_u8, g);
        buffer_write(buf, buffer_u8, g);
        buffer_write(buf, buffer_u8, 255);
      }
    return buf;
  }

  // periodic value noise in [0,1): smoothstep-interpolated over a hashed lattice whose corners WRAP
  // at `period` (= this octave's frequency), so the tile is seamless. Pure in (fx, fy, seed).
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
