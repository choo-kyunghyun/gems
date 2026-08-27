/**
 * @typedef {Object} RenderZoneLabelOptions
 * @property {number} [font] - font for the labels (default: leaves the current font)
 */

/**
 * world-space zone-name labels at each zone centroid; insert after RenderZone. The centroids are
 * cached and re-swept only when the channel's `edits` moves; the name is read live each draw.
 * reads grid.zoneMap(key) live; no-op when absent.
 * @implements {RenderPass}
 */
globalThis.RenderZoneLabel = class RenderZoneLabel {
  constructor(grid, key, opt = {}) {
    this.enabled = true;
    this.grid = grid;
    this.key = key;
    this.font = opt.font;
    this._map = undefined; // the channel instance the cache was swept from + its edit count
    this._edits = -1;
    this._labels = []; // { id, x, y } per painted zone, world px
  }

  destroy() {}

  _rebuild(map) {
    this._map = map;
    this._edits = map.edits;

    const cellWidth = this.grid.cellWidth;
    const cellHeight = this.grid.cellHeight;
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

    const labels = [];
    for (const id in count) {
      const n = count[id];
      labels.push({ id: +id, x: sumX[id] / n, y: sumY[id] / n });
    }
    this._labels = labels;
  }

  draw(_entities) {
    const map = this.grid.zoneMap(this.key);
    if (map === undefined) return;
    if (map !== this._map || map.edits !== this._edits) this._rebuild(map);
    const labels = this._labels;
    if (labels.length === 0) return;

    const color = draw_get_color();
    const alpha = draw_get_alpha();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const font = draw_get_font();
    if (this.font !== undefined) draw_set_font(this.font);

    draw_set_alpha(1);
    draw_set_color(c_white);
    draw_set_halign(fa_center);
    draw_set_valign(fa_middle);
    for (let i = 0; i < labels.length; i++) {
      const l = labels[i];
      draw_text(l.x, l.y, map.zone(l.id).name);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_font(font);
  }
};
