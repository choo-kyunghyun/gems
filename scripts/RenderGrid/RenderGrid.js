/**
 * @typedef {Object} RenderGridOptions
 * @property {number} [color] - grid line color (default c_gray)
 * @property {number} [alpha] - line alpha (default 1)
 */

/**
 * Cell boundary lines for a Level's grid. World-space pass — draw inside the
 * camera view. Split out of `RenderDebugTileMap` so the grid toggles independently
 * of cost shading / tile labels. Uses plain `draw_line` (`draw_line_width_color`
 * renders nothing on GMRT).
 *
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
  }

  destroy() {}

  draw(_world) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();

    const { cols, rows, cellWidth, cellHeight } = this.level;
    draw_set_alpha(this.alpha);
    draw_set_color(this.color);
    for (let x = 0; x <= cols; x++) {
      draw_line(x * cellWidth, 0, x * cellWidth, rows * cellHeight);
    }
    for (let y = 0; y <= rows; y++) {
      draw_line(0, y * cellHeight, cols * cellWidth, y * cellHeight);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
  }
};
