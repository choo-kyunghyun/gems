/**
 * A layer of the sky overlay (RenderOverlay hosts it under the day/night tint, so night darkens the
 * rain, and cuts it out over every roof). Draws in surface pixels: the condition's screen tint, then
 * its particles, which scroll on Weather.time() — a cumulative SIM-second clock (advanced by
 * Weather.update on Time.delta), so the fall FREEZES when the game pauses and dilates with
 * Time.scale (bed fast-forward). It must be a cumulative CLOCK, not a per-frame delta × fall speed
 * (which pins every particle near a constant offset). Snow sways via Math.sin; streaks use draw_line,
 * snow uses draw_rectangle.
 *
 * The level assigns pass.camera after building the camera.
 * @implements {RenderPass}
 */
globalThis.RenderWeather = class RenderWeather {
  constructor(opt = {}) {
    this.enabled = true;
    this.camera = opt.camera; // a Camera instance; assigned by ColonyMap.build
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

  draw(_entities) {
    if (this.camera === undefined) return;
    // Surface pixels: the host's surface is the application surface's size, so the tint covers the
    // screen regardless of camera pitch (a world-rect draw would foreshorten under a 2.5D pitched camera).
    const w = surface_get_width(application_surface);
    const h = surface_get_height(application_surface);
    if (!(w > 0)) return; // NaN-safe (NaN > 0 is false)

    const blend = Weather.blend();
    const color = draw_get_color();
    const alpha = draw_get_alpha();

    this._layer(Weather.previous(), 1 - blend, 0, 0, w, h);
    this._layer(Weather.current(), blend, 0, 0, w, h);

    draw_set_color(color);
    draw_set_alpha(alpha);
  }

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

  _rain(cond, intensity, x1, y1, w, h) {
    const n = Math.floor(this._maxN * cond.density);
    if (n <= 0) return;
    const t = Weather.time(); // cumulative SIM seconds (a clock, not a per-frame delta)
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

  _snow(cond, intensity, x1, y1, w, h) {
    const n = Math.floor(this._maxN * cond.density);
    if (n <= 0) return;
    const t = Weather.time(); // cumulative SIM seconds (a clock, not a per-frame delta)
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
