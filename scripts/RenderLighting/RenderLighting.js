/**
 * Day/night is "ambient with no lights"; point lights punch bright holes in the night.
 *   1. ambient fill — clear to the injected ambient provider (WorldClock.tint) → level * ambient
 *   2. light blobs  — each Light adds a soft radial glow with bm_add (overlaps sum)
 *   2b. vignette    — multiply corners down so night frames in at the edges (off in daylight)
 *   3. composite    — draw the light map over the world with multiply (final = level * light)
 * Self-balancing: in full daylight the ambient is white, the multiply is a no-op, so we early-out
 * (zero surface work). Surfaces + bm_add + multiply — NO shadows, falloff only.
 *
 * Inserted LAST in the RPG renderer; the scene draws its bright cues AFTER so they stay above the tint.
 * View rect from the Camera's OWN fields, NOT camera_get_view_* (matrix-driven Camera returns 0).
 * @implements {RenderPass}
 */
globalThis.RenderLighting = class RenderLighting {
  constructor(opt = {}) {
    this.enabled = true;
    this.camera = opt.camera; // a Camera instance; assigned by RpgMap.build
    // INJECTED ambient provider () => { color, alpha } — keeps this Gameplay-kit pass day/night-agnostic
    // (demo wires WorldClock.tint). Default full daylight (alpha 0) early-outs below.
    this.ambient = opt.ambient ?? (() => ({ color: c_white, alpha: 0 }));
    // scales the cycle's overlay alpha; higher = darker nights. clamped to 1 (never fully black).
    this.darkness = opt.darkness ?? 1.5;
    // corner-darkening fraction at full night, scaled by the cycle. 0 disables.
    this.vignette = opt.vignette ?? 0.25;
    this._surf = -1; // light-map surface, (re)created lazily (surface_exists(-1) is false)
    // cumulative SIM seconds the flicker phase rides on (the Weather.time() pattern): freezes on
    // pause and dilates with Time.scale — the clock-split invariant for world-space effects.
    this._flickerT = 0;
  }

  destroy() {
    if (surface_exists(this._surf)) surface_free(this._surf);
  }

  draw(entities) {
    if (this.camera === undefined) return;
    this._flickerT += Time.delta;

    // ambient → multiply model. k=0 → white (daylight): composite is a no-op, so skip all surface
    // work (lights stay invisible, correct for an outdoor cycle vs a dungeon torch).
    const tint = this.ambient();
    const k = Math.min(1, tint.alpha * this.darkness);
    if (k <= 0) return;
    const ambient = Color.merge(c_white, tint.color, k);

    // SCREEN-space overlay (surface = application-surface size) so it survives a pitched 2.5D camera:
    // blobs are PROJECTED to surface px via camera.project (a world-rect surface would foreshorten).
    const w = Math.floor(surface_get_width(application_surface));
    const h = Math.floor(surface_get_height(application_surface));
    if (!(w > 0) || !(h > 0)) return;

    // (re)create when missing (surfaces are volatile — lost on resize/focus) or size changed
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

    // 1 + 2. Build the light map: ambient fill, then additive light blobs at projected screen px.
    surface_set_target(this._surf);
    draw_clear_alpha(ambient, 1);
    gpu_set_blendmode(bm_add);
    const lights = entities.query(Light, Position);
    const alpha = SimClock.alpha; // render interpolation, like RenderEntity
    const zx = w / this.camera.width; // world→screen scale for the blob radius
    let i = 0;
    while (i < lights.length) {
      const id = lights[i];
      const lt = entities.get(Light, id);
      const pos = entities.get(Position, id);
      const prev = entities.get(PrevPosition, id);
      const wx = prev ? prev.x + (pos.x - prev.x) * alpha : pos.x;
      const wy = prev ? prev.y + (pos.y - prev.y) * alpha : pos.y;
      const s = this.camera.project(wx, wy, 0);
      let intensity = lt.intensity ?? 1;
      // flicker: sim-time sine per light (see _flickerT), id-offset so torches don't sync.
      if (lt.flicker)
        intensity *=
          1 -
          lt.flicker *
            (0.5 + 0.5 * Math.sin((this._flickerT * 1000) / 90 + id));
      draw_set_alpha(intensity);
      // hue center → black at radius; bm_add sums overlaps
      draw_circle_color(s.x, s.y, lt.radius * zx, lt.color, c_black, false);
      i++;
    }
    gpu_set_blendmode(bm_normal);

    // 2b. Vignette — multiplicative (bm_dest_colour, bm_zero), like the composite, so it DEEPENS
    // level colors rather than alpha-blending a flat-black wash. white-center → dark-edge radial.
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

    // 3. Composite multiplicatively (final = level * light). NO bm_multiply constant — src×dest via
    //    blendmode_ext. reset view/projection to surface-pixel ortho so it covers the screen at any pitch.
    const sv = matrix_get(matrix_view);
    const sp = matrix_get(matrix_projection);
    // SCREEN-SPACE OVERLAY ORIENTATION — the contract for any pass that resets view/projection to
    // surface-pixel ortho (RenderWeather, RenderCloudShadow cite this): up +1 AND a NEGATIVE ortho
    // height. The overlay path carries an inherent Y-flip vs the world camera, which the negative
    // height cancels. Negating the UP vector instead is a 180° ROLL: it X-MIRRORS the content about
    // screen center — invisible for symmetric content (ambient fill, vignette, a centered blob), so
    // it reads as correct until something off-center flips sides (the lantern at a clamped border).
    matrix_set(
      matrix_view,
      matrix_build_lookat(w / 2, h / 2, -1, w / 2, h / 2, 0, 0, 1, 0),
    );
    matrix_set(matrix_projection, matrix_build_projection_ortho(w, -h, 0, 2));
    // disable depth TEST: entities wrote depth in the world projection, so with the test on this
    // screen-space composite is REJECTED over every opaque entity pixel (sprites stay full-bright).
    gpu_set_ztestenable(false);
    gpu_set_blendmode_ext(bm_dest_colour, bm_zero);
    draw_set_alpha(1);
    draw_surface(this._surf, 0, 0);
    gpu_set_blendmode(bm_normal);
    gpu_set_ztestenable(true);
    matrix_set(matrix_view, sv);
    matrix_set(matrix_projection, sp);

    draw_set_color(prevColor);
    draw_set_alpha(prevAlpha);
  }
};
