/**
 * @typedef {Object} RenderZoneOptions
 * @property {number} [alpha] - fill alpha for zone cells (default 0.3)
 * @property {boolean} [border] - outline zone region borders (default true)
 */

/**
 * Debug overlay for one ZoneMap channel: tints each zone's cells by color and
 * outlines zone region borders (only edges where the neighbor differs). Zone-name
 * labels are a separate `RenderZoneLabel` pass — insert it after this one.
 *
 * World-space pass — draw inside the camera view (like RenderDebugTileMap), not
 * on the GUI layer. Reads `level.zoneMap(key)` live each frame; a no-op when that
 * channel doesn't exist, so it's safe to keep inserted before zones are painted.
 * Zone color is `zone.data.color` (a "#rrggbb" string) when present, else a stable
 * hue derived from the zone id.
 *
 * @implements {RenderPass}
 */
globalThis.RenderZone = class RenderZone {
  /**
   * @param {import("../Level/Level").Level} level
   * @param {string} key - zone channel, e.g. "faction"
   * @param {RenderZoneOptions} [opt]
   */
  constructor(level, key, opt = {}) {
    this.enabled = true;
    this.level = level;
    this.key = key;
    this.alpha = opt.alpha ?? 0.3;
    this.border = opt.border ?? true;
  }

  destroy() {}

  _color(zone) {
    const c = zone.data.color;
    // Stable, visually distinct hue per id when no explicit color (61 ≈ prime step).
    if (c === undefined) return Color.hsv((zone.id * 61) % 256, 170, 230);
    return Color.parse(c);
  }

  draw(_world) {
    const map = this.level.zoneMap(this.key);
    if (map === undefined) return;

    const color = draw_get_color();
    const alpha = draw_get_alpha();

    const cellWidth = this.level.cellWidth;
    const cellHeight = this.level.cellHeight;
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

        // Border: a colored line only on edges where the neighbor is a different
        // zone, so each painted region gets a crisp outline. map.idAt treats
        // out-of-bounds as 0, so the level edge outlines too. Plain draw_line —
        // draw_line_width_color renders nothing on GMRT (see CLAUDE.md).
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
