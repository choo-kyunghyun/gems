// World-space 2D LIGHT-MAP pass — the RPG's lighting + day/night in one. It generalizes a plain
// flat day/night tint: instead of a uniform darkness rectangle, it builds a per-frame
// light map (an off-screen surface) and composites it over the world MULTIPLICATIVELY, so the
// day/night cycle is just "the ambient term with no lights" and point lights punch bright holes
// in the night.
//
//   1. ambient fill   — the surface is cleared to WorldClock.tint() mapped to the multiply model
//                        (white in full daylight → night hue when dark), so unlit areas read as
//                        scene * ambient.
//   2. light blobs     — every Light + Position entity adds a soft radial glow with bm_add
//                        (draw_circle_color: hue center → black edge), so overlapping lights sum.
//   2b. vignette       — multiply the light map's corners down with a radial, so the night frames
//                        in toward the screen edges; scaled by the cycle (off in daylight).
//   3. composite       — the light map is drawn over the world with multiply
//                        (gpu_set_blendmode_ext(bm_dest_colour, bm_zero) → final = scene * light).
//
// The model is self-balancing: in full daylight the ambient is white, so additive lights clamp
// against 255 and the multiply is a no-op (no daytime halos) — so we early-out then and do zero
// surface work, exactly the alpha-0 daylight skip a flat day/night tint would take. Surfaces + bm_add + multiply are all
// probe-verified on GMRT 0.20 (see CLAUDE.md / memory). NO shadows yet — falloff only.
//
// Inserted LAST in the RPG renderer (over tiles + entities + weather); the scene draws its bright
// cues (station highlight, build cursor, floating numbers, muzzle flash) AFTER the renderer so
// they stay bright above the tint. View rect from the held Camera's OWN fields (toX/toY/width/
// height), NOT camera_get_view_* — the matrix-driven Camera returns 0 there (see CLAUDE.md). The
// scene assigns pass.camera after building the camera, like RenderWeather.
//
// @implements {RenderPass}
globalThis.RenderLighting = class RenderLighting {
  constructor(opt = {}) {
    this.enabled = true;
    this.camera = opt.camera; // a Camera instance; assigned by RpgMap.load
    // The multiply model needs a stronger darkening than the old lerp-overlay used, so scale the
    // cycle's overlay alpha. Higher = darker nights. Clamped to 1 (never a fully black ambient).
    this.darkness = opt.darkness ?? 1.5;
    // Corner-darkening fraction at full night (multiplied into the light map; scaled by the cycle
    // so it fades in at dusk and is gone in daylight). Subtle by default; 0 disables.
    this.vignette = opt.vignette ?? 0.25;
    this._surf = -1; // light-map surface, (re)created lazily at the view size (surface_exists(-1) is false)
  }

  destroy() {
    if (surface_exists(this._surf)) surface_free(this._surf);
  }

  draw(world) {
    if (this.camera === undefined) return;
    const vw = this.camera.width;
    const vh = this.camera.height;
    // Test > 0 (not <= 0): an uninitialized size could be NaN, and NaN <= 0 is false.
    if (!(vw > 0) || !(vh > 0)) return;

    // Ambient from the day/night cycle, mapped to the multiply model. k=0 → white (daylight);
    // k→1 → the night hue. In full daylight the ambient is white and lights would clamp to white,
    // so the composite can't change anything — skip all surface work (and lights stay invisible,
    // which is correct: this is an outdoor cycle, not a dungeon torch needing day-time light).
    const tint = WorldClock.tint();
    const k = Math.min(1, tint.alpha * this.darkness);
    if (k <= 0) return;
    const ambient = Color.merge(c_white, tint.color, k);

    const w = Math.floor(vw);
    const h = Math.floor(vh);
    const x1 = this.camera.toX - vw / 2; // view origin in world coords (camera fields are integer px)
    const y1 = this.camera.toY - vh / 2;

    // (Re)create the surface when missing (surfaces are volatile — lost on resize/focus) or when
    // the view size changed (e.g. the uiScale/resolution Setting applied live).
    if (
      !surface_exists(this._surf) ||
      surface_get_width(this._surf) !== w ||
      surface_get_height(this._surf) !== h
    ) {
      if (surface_exists(this._surf)) surface_free(this._surf);
      this._surf = surface_create(w, h);
    }

    const prevColor = draw_get_color();
    const prevAlpha = draw_get_alpha();

    // 1 + 2. Build the light map: ambient fill, then additive light blobs (surface-local coords).
    surface_set_target(this._surf);
    draw_clear_alpha(ambient, 1);
    gpu_set_blendmode(bm_add);
    const lights = world.query(Light, Position);
    const alpha = world.alpha; // render interpolation, like RenderEntity
    let i = 0;
    while (i < lights.length) {
      const id = lights[i];
      const lt = world.get(Light, id);
      const pos = world.get(Position, id);
      const prev = world.get(PrevPosition, id);
      const lx = (prev ? prev.x + (pos.x - prev.x) * alpha : pos.x) - x1;
      const ly = (prev ? prev.y + (pos.y - prev.y) * alpha : pos.y) - y1;
      let intensity = lt.intensity ?? 1;
      // Optional flicker — a cheap wall-clock sine per light (trig works on GMRT 0.20). Offset by
      // id so torches don't pulse in lockstep. Uses current_time (a clock, not Time.raw's delta).
      if (lt.flicker)
        intensity *=
          1 - lt.flicker * (0.5 + 0.5 * Math.sin(current_time / 90 + id));
      draw_set_alpha(intensity);
      // Soft radial light: hue at the center fading to black at `radius`; bm_add sums overlaps.
      draw_circle_color(lx, ly, lt.radius, lt.color, c_black, false);
      i++;
    }
    gpu_set_blendmode(bm_normal);

    // 2b. Vignette — multiply the light map down toward the corners so the night frames in at the
    // screen edges. Multiplicative (bm_dest_colour, bm_zero), like the composite below, so it
    // DEEPENS the scene colors rather than alpha-blending a flat-black wash. Scaled by k, so it
    // ramps in with the cycle (subtle at dusk → strongest at full night) and is gone in daylight
    // via the early-out above. A white-center → dark-edge radial reaching the corners (radius =
    // half-diagonal; the side midpoints clip outside the surface). After the lights, so a light in
    // a corner is framed by it too.
    if (this.vignette > 0) {
      const cx = w / 2;
      const cy = h / 2;
      const edge = Color.merge(c_white, c_black, this.vignette * k);
      gpu_set_blendmode_ext(bm_dest_colour, bm_zero);
      draw_circle_color(
        cx,
        cy,
        Math.sqrt(cx * cx + cy * cy),
        c_white,
        edge,
        false,
      );
      gpu_set_blendmode(bm_normal);
    }

    surface_reset_target();

    // 3. Composite over the world, multiplicatively (final = scene * light). No bm_multiply
    //    constant exists — it's src×dest via blendmode_ext (confirmed via gm-cli manual).
    gpu_set_blendmode_ext(bm_dest_colour, bm_zero);
    draw_set_alpha(1);
    draw_surface(this._surf, x1, y1);
    gpu_set_blendmode(bm_normal);

    draw_set_color(prevColor);
    draw_set_alpha(prevAlpha);
  }
};
