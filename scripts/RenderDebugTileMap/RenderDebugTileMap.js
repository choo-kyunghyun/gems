/**
 * @typedef {Object} RenderDebugTileMapOptions
 * @property {boolean} [grid] - draw cell boundary lines (default true)
 * @property {boolean} [cost] - shade cells by nav cost from Level.mpg (default true)
 * @property {boolean} [tiles] - label occupied cells with the topmost TileType (default true)
 * @property {boolean} [coords] - label every cell with its grid (x, y) (default false)
 * @property {boolean} [names] - show TileType.name instead of id when labelling tiles (default false)
 * @property {number} [color] - grid line color (default c_gray)
 * @property {number} [alpha] - fill alpha for cost shading (default 0.25)
 * @property {number} [font] - font for cell labels (default: leaves the current font)
 */

/**
 * Debug overlay for inspecting a Level's tile grid and pathfinding costs.
 *
 * Cost shading reads `level.mpg` (the merged pathfinding grid), so call
 * `level.syncAll()` first or the costs all read as the default (1). Tile
 * labels read the topmost layer that has a tile at each cell, mirroring how
 * `Level._computeNav` resolves nav data.
 *
 * @implements {RenderPass}
 */
globalThis.RenderDebugTileMap = class RenderDebugTileMap {
  /**
   * @param {import("../Level/Level").Level} level
   * @param {RenderDebugTileMapOptions} [opt]
   */
  constructor(level, opt = {}) {
    this.enabled = true;
    this.level = level;
    this.grid = opt.grid ?? true;
    this.cost = opt.cost ?? true;
    this.tiles = opt.tiles ?? true;
    this.coords = opt.coords ?? false;
    this.names = opt.names ?? false;
    this.color = opt.color ?? c_gray;
    this.alpha = opt.alpha ?? 0.25;
    this.font = opt.font;
  }

  destroy() {}

  // Topmost tile at a cell across all layers (matches Level nav resolution).
  _topTile(x, y) {
    const layers = this.level.layers;
    for (let i = layers.length - 1; i >= 0; i--) {
      const t = layers[i].get(x, y);
      if (t) return t;
    }
    return undefined;
  }

  draw(_world) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const font = draw_get_font();
    if (this.font !== undefined) draw_set_font(this.font);

    const { cols, rows, cellWidth, cellHeight, mpg } = this.level;

    // Cost shading: blocking cells red, costlier-than-default cells orange.
    if (this.cost) {
      draw_set_alpha(this.alpha);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const c = mpg.get(x, y);
          if (c === 1) continue; // default walkable — leave clear
          draw_set_color(c === Infinity ? c_red : c_orange);
          const wx = x * cellWidth;
          const wy = y * cellHeight;
          draw_rectangle(wx, wy, wx + cellWidth, wy + cellHeight, false);
        }
      }
    }

    // Cell grid lines.
    if (this.grid) {
      draw_set_alpha(1);
      draw_set_color(this.color);
      for (let x = 0; x <= cols; x++) {
        draw_line(x * cellWidth, 0, x * cellWidth, rows * cellHeight);
      }
      for (let y = 0; y <= rows; y++) {
        draw_line(0, y * cellHeight, cols * cellWidth, y * cellHeight);
      }
    }

    // Per-cell text labels.
    if (this.tiles || this.coords) {
      draw_set_alpha(1);
      draw_set_halign(fa_center);
      draw_set_valign(fa_middle);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const cx = x * cellWidth + cellWidth * 0.5;
          const cy = y * cellHeight + cellHeight * 0.5;

          if (this.tiles) {
            const t = this._topTile(x, y);
            if (t !== undefined) {
              draw_set_color(c_white);
              draw_text(cx, cy, this.names ? t.name : String(t.id));
            }
          }

          if (this.coords) {
            draw_set_color(c_aqua);
            draw_set_valign(fa_top);
            draw_text(cx, y * cellHeight + 2, `${x},${y}`);
            draw_set_valign(fa_middle);
          }
        }
      }
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_font(font);
  }
};
