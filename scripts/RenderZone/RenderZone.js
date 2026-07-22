/**
 * @typedef {Object} RenderZoneOptions
 * @property {number} [alpha] - fill alpha for zone cells (default 0.3)
 * @property {boolean} [border] - outline zone region borders (default true)
 */

/**
 * world-space debug overlay for one ZoneMap channel: tints cells + outlines region borders.
 * names are a separate RenderZoneLabel pass. reads grid.zoneMap(key) live; no-op when absent,
 * so safe to insert before zones are painted.
 * @implements {RenderPass}
 */
globalThis.RenderZone = class RenderZone {
  /**
   * @param {LevelGrid} grid
   * @param {string} key - zone channel, e.g. "faction"
   * @param {RenderZoneOptions} [opt]
   */
  constructor(grid, key, opt = {}) {
    this.enabled = true;
    this.grid = grid;
    this.key = key;
    this.alpha = opt.alpha ?? 0.3;
    this.border = opt.border ?? true;
  }

  destroy() {}

  _color(zone) {
    const c = zone.data.color;
    // stable hue per id when no explicit color (61 ≈ prime step for spread)
    if (c === undefined) return Color.hsv((zone.id * 61) % 256, 170, 230);
    return Color.parse(c);
  }

  draw(_entities) {
    const map = this.grid.zoneMap(this.key);
    if (map === undefined) return;

    const color = draw_get_color();
    const alpha = draw_get_alpha();

    const cellWidth = this.grid.cellWidth;
    const cellHeight = this.grid.cellHeight;
    const grid = map.grid;
    const cols = grid.cols;
    const rows = grid.rows;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const id = grid.get(x, y);
        if (id === 0) continue;
        const zone = map.zone(id);
        if (zone === undefined) continue;

        const wx = x * cellWidth;
        const wy = y * cellHeight;
        const col = this._color(zone);

        draw_set_alpha(this.alpha);
        draw_set_color(col);
        draw_rectangle(wx, wy, wx + cellWidth, wy + cellHeight, false);

        // line only on edges where the neighbor differs (idAt treats OOB as 0, so map edges
        // outline too). plain draw_line — kept from 0.19; draw_line_width_color works on 0.20.
        if (this.border) {
          draw_set_alpha(1);
          if (map.idAt(x, y - 1) !== id) draw_line(wx, wy, wx + cellWidth, wy);
          if (map.idAt(x, y + 1) !== id)
            draw_line(wx, wy + cellHeight, wx + cellWidth, wy + cellHeight);
          if (map.idAt(x - 1, y) !== id) draw_line(wx, wy, wx, wy + cellHeight);
          if (map.idAt(x + 1, y) !== id)
            draw_line(wx + cellWidth, wy, wx + cellWidth, wy + cellHeight);
        }
      }
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
  }
};
