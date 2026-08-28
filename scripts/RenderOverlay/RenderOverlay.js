/**
 * A screen-space OVERLAY over the world: the passes it hosts (`layers` — the sky's
 * RenderCloudShadow and RenderWeather) draw in surface pixels onto one transparent surface the
 * size of the application surface, the injected `cutout` rects are erased from it, and it
 * composites once. That is what lets an overlay spare a region: a roof. `cutout()` returns world
 * rects ({x1,y1,x2,y2}, x2/y2 exclusive) standing `height` world px tall (up = -z, the wall
 * convention); under the fixed-yaw pitched ortho camera a box projects to ONE screen rect — the
 * ceiling is the floor shifted up-screen, the side faces the strip between — so the erase is a
 * draw_rectangle per rect, no geometry. A yawing camera would break that (the Vox contract
 * RenderWalls rests on, too).
 *
 * Inside the surface the blend is normal colour with SEPARATE alpha (src + dst·(1−a) on both),
 * so the surface holds premultiplied colour under its true coverage — a layer darkens with a
 * black quad at alpha, tints with a coloured one — and the erase is (bm_zero, bm_inv_src_alpha):
 * an opaque draw zeroes colour and alpha. The composite is premultiplied (bm_one,
 * bm_inv_src_alpha) under the screen-space overlay orientation contract (RenderLighting). A layer
 * draws in surface pixels with no matrix or blend changes of its own (Camera.project for anything
 * world-anchored); the depth test is off for the whole bracket.
 *
 * The scene assigns pass.camera after building the camera.
 * @implements {RenderPass}
 */
globalThis.RenderOverlay = class RenderOverlay {
  constructor(opt = {}) {
    this.enabled = true;
    this.camera = opt.camera; // a Camera instance
    this.layers = opt.layers ?? []; // RenderPass[], drawn in order into the surface; destroyed with this
    this.cutout = opt.cutout; // () => world rects to erase, or undefined for none
    this.height = opt.height ?? 0; // how tall a cutout stands (world px, up = -z)
    this._surf = -1; // the overlay surface, (re)created lazily (surface_exists(-1) is false)
  }

  destroy() {
    for (let i = 0; i < this.layers.length; i++) this.layers[i].destroy();
    this.layers = [];
    if (surface_exists(this._surf)) surface_free(this._surf);
  }

  draw(entities) {
    if (this.camera === undefined) return;
    const w = Math.floor(surface_get_width(application_surface));
    const h = Math.floor(surface_get_height(application_surface));
    if (!(w > 0) || !(h > 0)) return; // NaN-safe (NaN > 0 is false)

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
    const sv = matrix_get(matrix_view);
    const sp = matrix_get(matrix_projection);

    surface_set_target(this._surf);
    draw_clear_alpha(c_black, 0);
    gpu_set_ztestenable(false);
    gpu_set_blendmode_ext_sepalpha(
      bm_src_alpha,
      bm_inv_src_alpha,
      bm_one,
      bm_inv_src_alpha,
    );
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i];
      if (layer.enabled) layer.draw(entities);
    }
    if (this.cutout !== undefined) this._erase(this.cutout(), w, h);
    gpu_set_blendmode(bm_normal);
    surface_reset_target();

    // composite, premultiplied, under the screen-space overlay orientation contract
    matrix_set(
      matrix_view,
      matrix_build_lookat(w / 2, h / 2, -1, w / 2, h / 2, 0, 0, 1, 0),
    );
    matrix_set(matrix_projection, matrix_build_projection_ortho(w, -h, 0, 2));
    gpu_set_blendmode_ext(bm_one, bm_inv_src_alpha);
    draw_set_color(c_white);
    draw_set_alpha(1);
    draw_surface(this._surf, 0, 0);
    gpu_set_blendmode(bm_normal);
    gpu_set_ztestenable(true);
    matrix_set(matrix_view, sv);
    matrix_set(matrix_projection, sp);
    draw_set_color(prevColor);
    draw_set_alpha(prevAlpha);
  }

  /** Erase every on-screen cutout box's screen rect from the surface (the target is set). */
  _erase(rects, w, h) {
    if (rects.length === 0) return;
    const cam = this.camera;
    const z = -this.height;
    gpu_set_blendmode_ext(bm_zero, bm_inv_src_alpha);
    draw_set_color(c_black);
    draw_set_alpha(1);
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const f0 = cam.project(r.x1, r.y1, 0);
      const f1 = cam.project(r.x2, r.y2, 0);
      const c0 = cam.project(r.x1, r.y1, z);
      const c1 = cam.project(r.x2, r.y2, z);
      const x0 = Math.min(f0.x, c0.x);
      const x1 = Math.max(f1.x, c1.x);
      const y0 = Math.min(f0.y, f1.y, c0.y, c1.y);
      const y1 = Math.max(f0.y, f1.y, c0.y, c1.y);
      if (x1 < 0 || y1 < 0 || x0 > w || y0 > h) continue;
      draw_rectangle(x0, y0, x1, y1, false);
    }
  }
};
