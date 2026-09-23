/**
 * @typedef {Object} RenderGridOptions
 * @property {number} [color]
 * @property {number} [alpha]
 * @property {object} [camera] - the level's view record; when set, lines are view-culled.
 */

/** @implements {RenderPass} */
globalThis.RenderGrid = class RenderGrid {
  constructor(grid, opt = {}) {
    this.enabled = true;
    this.grid = grid;
    this.color = opt.color ?? c_gray;
    this.alpha = opt.alpha ?? 1;
    this.camera = opt.camera;
  }

  destroy() {}

  draw(_entities) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();

    const { cellWidth, cellHeight } = this.grid;

    // x1 is the window's exclusive cell bound, so the inclusive loop draws the closing line
    const r = this.grid.viewRange(this.camera);

    draw_set_alpha(this.alpha);
    draw_set_color(this.color);
    const top = r.y0 * cellHeight;
    const bottom = r.y1 * cellHeight;
    const left = r.x0 * cellWidth;
    const right = r.x1 * cellWidth;
    for (let x = r.x0; x <= r.x1; x++) {
      draw_line(x * cellWidth, top, x * cellWidth, bottom);
    }
    for (let y = r.y0; y <= r.y1; y++) {
      draw_line(left, y * cellHeight, right, y * cellHeight);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
  }
};
