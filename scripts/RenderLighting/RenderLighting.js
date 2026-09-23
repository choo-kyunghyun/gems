/**
 * Day/night as a multiplied light map: the ambient fill with additive point-light blobs and an
 * edge vignette, multiplied over the world. In full daylight the multiply is a no-op, so the pass
 * does no surface work. Falloff only, no shadows. Insert it last; anything drawn after stays
 * above the tint.
 * @implements {RenderPass}
 */
globalThis.RenderLighting = class RenderLighting {
  constructor(opt = {}) {
    this.enabled = true;
    this.camera = opt.camera; // the level's view record
    // an injected () => { color, alpha }, keeping the pass day/night-agnostic
    this.ambient = opt.ambient ?? (() => ({ color: c_white, alpha: 0 }));
    // scales the ambient alpha; higher = darker nights, clamped to 1
    this.darkness = opt.darkness ?? 1.5;
    // corner-darkening fraction at full night; 0 disables
    this.vignette = opt.vignette ?? 0.25;
    this._surf = -1; // created lazily
    // sim seconds, so the flicker freezes on pause and dilates with the time scale
    this._flickerT = 0;
  }

  destroy() {
    if (surface_exists(this._surf)) surface_free(this._surf);
  }

  draw(entities) {
    if (this.camera === undefined) return;
    this._flickerT += Time.delta;

    // at k = 0 the ambient is white and the composite a no-op, so lights stay invisible by day
    const tint = this.ambient();
    const k = Math.min(1, tint.alpha * this.darkness);
    if (k <= 0) return;
    const ambient = Color.merge(c_white, tint.color, k);

    // screen space, with blobs projected to surface px, so it survives a pitched camera where a
    // world-rect surface would foreshorten
    const w = Math.floor(surface_get_width(application_surface));
    const h = Math.floor(surface_get_height(application_surface));
    if (!(w > 0) || !(h > 0)) return;

    // surfaces are volatile: recreate when lost or resized
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

    surface_set_target(this._surf);
    draw_clear_alpha(ambient, 1);
    gpu_set_blendmode(bm_add);
    const zx = w / this.camera.width; // world-to-screen scale for the blob radius
    entities.forEach([Light, Position], (id, lt, pos) => {
      const s = this.camera.project(pos.x, pos.y, 0);
      let intensity = lt.intensity ?? 1;
      // id-offset so torches don't flicker in sync
      if (lt.flicker)
        intensity *=
          1 -
          lt.flicker *
            (0.5 + 0.5 * Math.sin((this._flickerT * 1000) / 90 + id));
      draw_set_alpha(intensity);
      draw_circle_color(s.x, s.y, lt.radius * zx, lt.color, c_black, false);
    });
    gpu_set_blendmode(bm_normal);

    // multiplicative, so the vignette deepens colors rather than washing them flat black
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

    // surface-pixel ortho, so the composite covers the screen at any pitch
    const sv = matrix_get(matrix_view);
    const sp = matrix_get(matrix_projection);
    // up +1 and a negative ortho height: the height cancels the overlay's Y-flip against the world
    // camera. Negating the up vector instead rolls 180°, X-mirroring off-center content.
    matrix_set(
      matrix_view,
      matrix_build_lookat(w / 2, h / 2, -1, w / 2, h / 2, 0, 0, 1, 0),
    );
    matrix_set(matrix_projection, matrix_build_projection_ortho(w, -h, 0, 2));
    // entities wrote depth in the world projection, which would reject this composite over them

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
