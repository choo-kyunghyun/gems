// World-space pass that draws the current Weather over the camera view: a flat tint plus falling
// rain / drifting snow. Cross-fades the outgoing + incoming conditions by Weather.blend() so the
// weather eases in/out. Inserted just BEFORE RenderDayNight so the night tint also darkens the
// rain; the scene's post-renderer cues (station highlight, build cursor, floating numbers) stay
// bright above it.
//
// Particles are screen-space relative to the view rect (rain falls on the screen, not world-
// locked) and scroll on a cumulative wall-clock (current_time — monotonic real ms, so they keep
// falling while the sim is paused, like the UI). NOTE: the old code multiplied Time.raw — a PER-
// FRAME delta, not a clock — by the fall speed, so every particle sat at a near-constant offset
// each frame: that was the "rain/snow static" bug. Snow weaves with a sinusoidal horizontal sway
// (Math.sin — trig works on GMRT 0.20); rain falls straight diagonal. Streaks use draw_line
// (draw_line_width_color renders NOTHING on GMRT); snow uses draw_rectangle.
//
// View rect from the held Camera's own fields (toX/toY/width/height), NOT camera_get_view_* — the
// project's Camera drives the view by matrix so camera_get_view_* returns 0 (see CLAUDE.md). The
// scene assigns pass.camera after building the camera, like RenderDayNight.
//
// @implements {RenderPass}
globalThis.RenderWeather = class RenderWeather {
  constructor(opt = {}) {
    this.enabled = true;
    this.camera = opt.camera; // a Camera instance; assigned by RpgMap.load
    this._maxN = opt.maxParticles ?? 320; // particle budget at density 1

    this._rainColor = Color.parse("#aebfd4");
    this._snowColor = Color.parse("#eef4fb");

    // Fixed normalized base positions [0,1) generated ONCE, so particles don't re-randomize each
    // frame; scaled to the view + scrolled by time below. _pr adds per-particle length jitter.
    this._px = [];
    this._py = [];
    this._pr = [];
    let i = 0;
    while (i < this._maxN) {
      this._px.push(Math.random());
      this._py.push(Math.random());
      this._pr.push(Math.random());
      i++;
    }
  }

  destroy() {}

  draw(_world) {
    if (this.camera === undefined) return;
    const w = this.camera.width;
    const h = this.camera.height;
    if (!(w > 0)) return; // NaN-safe (NaN > 0 is false) — layout not ready
    const x1 = this.camera.toX - w / 2;
    const y1 = this.camera.toY - h / 2;

    const blend = Weather.blend();
    const color = draw_get_color();
    const alpha = draw_get_alpha();

    this._layer(Weather.previous(), 1 - blend, x1, y1, w, h);
    this._layer(Weather.current(), blend, x1, y1, w, h);

    draw_set_color(color);
    draw_set_alpha(alpha);
  }

  // Draw one condition at `intensity` (0..1) over the view rect: tint, then particles.
  _layer(cond, intensity, x1, y1, w, h) {
    if (intensity <= 0) return;
    if (cond.a > 0) {
      // Inflate 2px so camera pixel-rounding can't leave a seam at the screen edge.
      draw_set_color(Color.parse(cond.c));
      draw_set_alpha(cond.a * intensity);
      draw_rectangle(x1 - 2, y1 - 2, x1 + w + 2, y1 + h + 2, false);
    }
    if (cond.particle === "rain") this._rain(cond, intensity, x1, y1, w, h);
    else if (cond.particle === "snow")
      this._snow(cond, intensity, x1, y1, w, h);
  }

  // Falling rain streaks: fast vertical fall + a mild leftward wind.
  _rain(cond, intensity, x1, y1, w, h) {
    const n = Math.floor(this._maxN * cond.density);
    if (n <= 0) return;
    const t = current_time / 1000; // cumulative wall-clock seconds (NOT Time.raw, a per-frame delta)
    const fall = 850; // px/s
    const slant = -5; // streak lean + wind direction
    draw_set_color(this._rainColor);
    draw_set_alpha(0.45 * intensity);
    let i = 0;
    while (i < n) {
      const len = 10 + this._pr[i] * 8; // 10..18px streak
      let px = (this._px[i] * w + slant * 4 * t) % w; // wind drift
      if (px < 0) px += w;
      let py = (this._py[i] * h + fall * t) % h;
      const sx = x1 + px;
      const sy = y1 + py;
      draw_line(sx, sy, sx + slant, sy + len);
      i++;
    }
  }

  // Drifting snow flakes: gentle fall + a uniform sideways wind.
  _snow(cond, intensity, x1, y1, w, h) {
    const n = Math.floor(this._maxN * cond.density);
    if (n <= 0) return;
    const t = current_time / 1000; // cumulative wall-clock seconds (NOT Time.raw, a per-frame delta)
    const fall = 70; // px/s — gentle
    const wind = 18;
    draw_set_color(this._snowColor);
    draw_set_alpha(0.8 * intensity);
    let i = 0;
    while (i < n) {
      const sz = 2 + Math.floor(this._pr[i] * 2); // 2..3px flakes
      // Horizontal weave: a gentle per-flake sine sway over the steady wind drift (trig, 0.20).
      const sway = 12 * Math.sin(t * 1.2 + this._pr[i] * 6.2832);
      let px = (this._px[i] * w + wind * t + sway) % w;
      if (px < 0) px += w;
      let py = (this._py[i] * h + fall * t) % h;
      const sx = x1 + px;
      const sy = y1 + py;
      draw_rectangle(sx, sy, sx + sz, sy + sz, false);
      i++;
    }
  }
};
