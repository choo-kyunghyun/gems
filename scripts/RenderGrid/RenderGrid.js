/**
 * @typedef {Object} RenderGridOptions
 * @property {number} [color] - grid line color (default c_gray)
 * @property {number} [alpha] - line alpha (default 1)
 * @property {object} [camera] - Camera; when set, view-culls lines for large grids. Settable via `pass.camera`.
 */

/** @implements {RenderPass} */
globalThis.RenderGrid = class RenderGrid {
  constructor(grid, opt = {}) {
    this.enabled = true;
    this.grid = grid;
    this.color = opt.color ?? c_gray;
    this.alpha = opt.alpha ?? 1;
    this.camera = opt.camera; // optional view-cull source (see draw)
  }

  destroy() {}

  draw(_entities) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();

    const { cols, rows, cellWidth, cellHeight } = this.grid;

    // visible cell range — culled to the camera view rect when set, else full grid
    let x0 = 0;
    let y0 = 0;
    let x1 = cols;
    let y1 = rows;
    if (this.camera !== undefined && this.camera.width > 0) {
      // Camera.groundRect, never camera_get_view_* (returns 0 for the matrix-driven Camera);
      // it also owns the pitch stretch, so lines still reach the top/bottom of a tilted view.
      const view = this.camera.groundRect();
      x0 = Math.max(0, Math.floor(view.x1 / cellWidth));
      y0 = Math.max(0, Math.floor(view.y1 / cellHeight));
      x1 = Math.min(cols, Math.ceil(view.x2 / cellWidth));
      y1 = Math.min(rows, Math.ceil(view.y2 / cellHeight));
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
