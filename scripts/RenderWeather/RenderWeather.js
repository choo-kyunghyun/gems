// World-space pass drawing the current Weather: a flat tint plus falling rain / drifting snow,
// cross-faded by Weather.blend(). Inserted just BEFORE RenderLighting so the night tint also darkens
// the rain.
//
// Particles are screen-space and scroll on current_time (a cumulative wall-clock, monotonic — so
// they keep falling while the sim is paused). NOT Time.raw, which is a per-frame DELTA, not a clock:
// multiplying it by fall speed froze every particle near a constant offset (the old "static" bug).
// Snow sways via Math.sin (trig works on GMRT 0.20); streaks use draw_line (draw_line_width_color
// renders NOTHING on GMRT), snow uses draw_rectangle.
//
// View rect from the held Camera's own fields, NOT camera_get_view_* (returns 0 for the matrix-driven
// Camera; see CLAUDE.md). The scene assigns pass.camera after building the camera.
//
// @implements {RenderPass}
globalThis.RenderWeather = class RenderWeather {
  constructor(opt = {}) {
    this.enabled = true;
    this.camera = opt.camera; // a Camera instance; assigned by RpgMap.build
    this._maxN = opt.maxParticles ?? 320; // particle budget at density 1

    this._rainColor = Color.parse("#aebfd4");
    this._snowColor = Color.parse("#eef4fb");

    // fixed normalized base positions generated once (so particles don't re-randomize each frame);
    // scaled to view + scrolled by time below. _pr adds per-particle length jitter.
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
    // Screen-space: cover the application surface in pixel coords so the tint fills the screen
    // regardless of camera pitch (a world-rect draw would foreshorten under a 2.5D pitched camera).
    // Reset view/projection to a flat surface-pixel ortho here, restored below.
    const w = surface_get_width(application_surface);
    const h = surface_get_height(application_surface);
    if (!(w > 0)) return; // NaN-safe (NaN > 0 is false)

    const blend = Weather.blend();
    const color = draw_get_color();
    const alpha = draw_get_alpha();
    const sv = matrix_get(matrix_view);
    const sp = matrix_get(matrix_projection);
    // Screen-ortho orientation PROBED on GMRT 0.20 (see CLAUDE.md / RenderLighting): up +1 keeps
    // X true, NEGATIVE ortho height cancels the overlay path's Y-flip vs the world camera.
    matrix_set(
      matrix_view,
      matrix_build_lookat(w / 2, h / 2, -1, w / 2, h / 2, 0, 0, 1, 0),
    );
    matrix_set(matrix_projection, matrix_build_projection_ortho(w, -h, 0, 2));
    // Disable the depth TEST: entities wrote near depth in the world projection, so with the test on
    // this screen-ortho tint is rejected over every opaque entity pixel (skipping all sprites). The
    // overlay must cover everything; restore the default (on) after.
    gpu_set_ztestenable(false);

    this._layer(Weather.previous(), 1 - blend, 0, 0, w, h);
    this._layer(Weather.current(), blend, 0, 0, w, h);

    gpu_set_ztestenable(true);
    matrix_set(matrix_view, sv);
    matrix_set(matrix_projection, sp);
    draw_set_color(color);
    draw_set_alpha(alpha);
  }

  // draw one condition at `intensity` over the view rect: tint, then particles
  _layer(cond, intensity, x1, y1, w, h) {
    if (intensity <= 0) return;
    if (cond.a > 0) {
      // inflate 2px so camera pixel-rounding can't leave a seam at the screen edge
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
