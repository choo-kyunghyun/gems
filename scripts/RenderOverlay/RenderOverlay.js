/**
 * A screen-space OVERLAY over the world: its `layers` draw in surface pixels onto one transparent
 * surface, the `cutout` cells are erased from it, and it composites once — which lets an overlay
 * spare a region, such as a roof. `cutout()` returns cell indices of `tiles`, each a box standing
 * `height` world px tall (up = -z); under the fixed-yaw pitched ortho camera such a box projects
 * to ONE screen rect, and the projection is affine, so the erase is a rectangle per cell off one
 * set of per-frame steps. A yawing camera breaks that.
 *
 * The surface holds premultiplied colour under its true coverage (separate-alpha blend), so a
 * layer darkens with a black quad at alpha and tints with a coloured one; the composite is
 * premultiplied. A layer draws in surface pixels with no matrix or blend changes of its own; the
 * depth test is off for the whole bracket.
 * @implements {RenderPass}
 */
globalThis.RenderOverlay = class RenderOverlay {
  constructor(opt = {}) {
    this.enabled = true;
    this.camera = opt.camera; // {View}
    this.layers = opt.layers ?? []; // RenderPass[], owned: destroyed with this
    this.cutout = opt.cutout; // () => cell indices to erase, or undefined for none
    this.tiles = opt.tiles; // {LevelGrid} the grid `cutout` indexes
    this.height = opt.height ?? 0;
    this._surf = -1; // created lazily
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

    // surfaces are volatile — lost on resize/focus
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

  /** An opaque draw under this blend zeroes colour and alpha. Expects the surface as target. */
  _erase(cells, w, h) {
    if (cells.length === 0) return;
    const cam = this.camera;
    const tiles = this.tiles;
    const cols = tiles.cols;
    // one cell's steps on screen: across a column, down a row, up to the roof
    const o = cam.project(0, 0, 0);
    const dx = cam.project(tiles.cellWidth, 0, 0).x - o.x;
    const dy = cam.project(0, tiles.cellHeight, 0).y - o.y;
    const dz = cam.project(0, 0, -this.height).y - o.y;
    const lo = Math.min(0, dy, dz, dy + dz);
    const hi = Math.max(0, dy, dz, dy + dz);
    gpu_set_blendmode_ext(bm_zero, bm_inv_src_alpha);
    draw_set_color(c_black);
    draw_set_alpha(1);
    for (let i = 0; i < cells.length; i++) {
      const gx = cells[i] % cols;
      const gy = Math.floor(cells[i] / cols);
      // both edges off the same product, so neighbours meet with no seam
      const xa = o.x + gx * dx;
      const xb = o.x + (gx + 1) * dx;
      const sy = o.y + gy * dy;
      const x0 = Math.min(xa, xb);
      const x1 = Math.max(xa, xb);
      const y0 = sy + lo;
      const y1 = sy + hi;
      if (x1 < 0 || y1 < 0 || x0 > w || y0 > h) continue;
      draw_rectangle(x0, y0, x1, y1, false);
    }
  }
};
