/**
 * @typedef {Object} RenderGridOptions
 * @property {number} [color] - grid line color (default c_gray)
 * @property {number} [alpha] - line alpha (default 1)
 * @property {object} [camera] - Camera; when set, view-culls lines for large grids. Settable via `pass.camera`.
 */

/**
 * world-space cell boundary lines. plain draw_line (kept from 0.19; draw_line_width_color works on 0.20).
 * @implements {RenderPass}
 */
globalThis.RenderGrid = class RenderGrid {
  /**
   * @param {import("../Level/Level").Level} level
   * @param {RenderGridOptions} [opt]
   */
  constructor(level, opt = {}) {
    this.enabled = true;
    this.level = level;
    this.color = opt.color ?? c_gray;
    this.alpha = opt.alpha ?? 1;
    this.camera = opt.camera; // optional view-cull source (see draw)
  }

  destroy() {}

  draw(_entities) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();

    const { cols, rows, cellWidth, cellHeight } = this.level;

    // visible cell range — culled to the camera view rect when set, else full grid
    let x0 = 0;
    let y0 = 0;
    let x1 = cols;
    let y1 = rows;
    if (this.camera !== undefined && this.camera.width > 0) {
      // read the Camera's OWN fields, not camera_get_view_* (returns 0 for the matrix-driven
      // Camera). ORTHO camera is centered on (toX,toY) spanning width × height.
      const vw = this.camera.width;
      const vh = this.camera.height;
      const vx = this.camera.toX - vw / 2;
      const vy = this.camera.toY - vh / 2;
      x0 = Math.max(0, Math.floor(vx / cellWidth));
      y0 = Math.max(0, Math.floor(vy / cellHeight));
      x1 = Math.min(cols, Math.ceil((vx + vw) / cellWidth));
      y1 = Math.min(rows, Math.ceil((vy + vh) / cellHeight));
    }

    draw_set_alpha(this.alpha);
    draw_set_color(this.color);
    const top = y0 * cellHeight;
    const bottom = y1 * cellHeight;
    const left = x0 * cellWidth;
    const right = x1 * cellWidth;
    for (let x = x0; x <= x1; x++) {
      draw_line(x * cellWidth, top, x * cellWidth, bottom);
    }
    for (let y = y0; y <= y1; y++) {
      draw_line(left, y * cellHeight, right, y * cellHeight);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
  }
};
