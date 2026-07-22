/**
 * @typedef {Object} RenderZoneLabelOptions
 * @property {number} [font] - font for the labels (default: leaves the current font)
 */

/**
 * world-space zone-name labels at each zone centroid; insert after RenderZone.
 * reads level.zoneMap(key) live; no-op when absent.
 * @implements {RenderPass}
 */
globalThis.RenderZoneLabel = class RenderZoneLabel {
  /**
   * @param {import("../Level/Level").Level} level
   * @param {string} key - zone channel, e.g. "faction"
   * @param {RenderZoneLabelOptions} [opt]
   */
  constructor(level, key, opt = {}) {
    this.enabled = true;
    this.level = level;
    this.key = key;
    this.font = opt.font;
  }

  destroy() {}

  draw(_entities) {
    const map = this.level.zoneMap(this.key);
    if (map === undefined) return;

    const color = draw_get_color();
    const alpha = draw_get_alpha();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const font = draw_get_font();
    if (this.font !== undefined) draw_set_font(this.font);

    const cellWidth = this.level.cellWidth;
    const cellHeight = this.level.cellHeight;
    const grid = map.grid;
    const cols = grid.cols;
    const rows = grid.rows;

    // centroid accumulators keyed by id — plain objects (Map/Set iteration banned on GMRT)
    const sumX = {};
    const sumY = {};
    const count = {};
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const id = grid.get(x, y);
        if (id === 0) continue;
        if (map.zone(id) === undefined) continue;
        sumX[id] = (sumX[id] ?? 0) + x * cellWidth + cellWidth * 0.5;
        sumY[id] = (sumY[id] ?? 0) + y * cellHeight + cellHeight * 0.5;
        count[id] = (count[id] ?? 0) + 1;
      }
    }

    draw_set_alpha(1);
    draw_set_color(c_white);
    draw_set_halign(fa_center);
    draw_set_valign(fa_middle);
    for (const id in count) {
      const n = count[id];
      draw_text(sumX[id] / n, sumY[id] / n, map.zone(+id).name);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_font(font);
  }
};
