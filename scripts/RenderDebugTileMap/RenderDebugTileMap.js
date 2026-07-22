/**
 * @typedef {Object} RenderDebugTileMapOptions
 * @property {boolean} [cost] - shade cells by tile nav cost (grid.costAt, default true)
 * @property {boolean} [tiles] - label occupied cells with the topmost TileType (default true)
 * @property {boolean} [coords] - label every cell with its grid (x, y) (default false)
 * @property {boolean} [names] - show TileType.name instead of id when labelling tiles (default false)
 * @property {number} [alpha] - fill alpha for cost shading (default 0.25)
 * @property {number} [font] - font for cell labels (default: leaves the current font)
 * @property {object} [camera] - Camera; when set, view-culls cells for large grids. Settable via `pass.camera`.
 */

/**
 * overlay for inspecting Level tile costs + types (grid lines are a separate RenderGrid pass).
 * cost shading reads grid.costAt(x, y) live — computed from the layers on demand, no sync step.
 * @implements {RenderPass}
 */
globalThis.RenderDebugTileMap = class RenderDebugTileMap {
  /**
   * @param {LevelGrid} grid
   * @param {RenderDebugTileMapOptions} [opt]
   */
  constructor(grid, opt = {}) {
    this.enabled = true;
    this.grid = grid;
    this.cost = opt.cost ?? true;
    this.tiles = opt.tiles ?? true;
    this.coords = opt.coords ?? false;
    this.names = opt.names ?? false;
    this.alpha = opt.alpha ?? 0.25;
    this.font = opt.font;
    this.camera = opt.camera; // optional view-cull source (see _range)
  }

  destroy() {}

  // visible cell range, culled to the camera view rect when set. read the Camera's OWN fields,
  // not camera_get_view_* (returns 0 for the matrix-driven Camera). ORTHO camera
  // is centered on (toX,toY) spanning width × height.
  _range() {
    const { cols, rows, cellWidth, cellHeight } = this.grid;
    if (this.camera === undefined || !(this.camera.width > 0))
      return { x0: 0, y0: 0, x1: cols - 1, y1: rows - 1 };
    const vw = this.camera.width;
    const vh = this.camera.height;
    const vx = this.camera.toX - vw / 2;
    const vy = this.camera.toY - vh / 2;
    return {
      x0: Math.max(0, Math.floor(vx / cellWidth)),
      y0: Math.max(0, Math.floor(vy / cellHeight)),
      x1: Math.min(cols - 1, Math.floor((vx + vw) / cellWidth)),
      y1: Math.min(rows - 1, Math.floor((vy + vh) / cellHeight)),
    };
  }

  // topmost tile across all layers (matches Level nav resolution)
  _topTile(x, y) {
    const layers = this.grid.layers;
    for (let i = layers.length - 1; i >= 0; i--) {
      const t = layers[i].get(x, y);
      if (t) return t;
    }
    return undefined;
  }

  draw(_entities) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const font = draw_get_font();
    if (this.font !== undefined) draw_set_font(this.font);

    const { cellWidth, cellHeight } = this.grid;
    const r = this._range();

    // cost shading: blocking cells red, costlier-than-default orange
    if (this.cost) {
      draw_set_alpha(this.alpha);
      for (let y = r.y0; y <= r.y1; y++) {
        for (let x = r.x0; x <= r.x1; x++) {
          const c = this.grid.costAt(x, y);
          if (c === 1) continue; // default walkable
          draw_set_color(c === Infinity ? c_red : c_orange);
          const wx = x * cellWidth;
          const wy = y * cellHeight;
          draw_rectangle(wx, wy, wx + cellWidth, wy + cellHeight, false);
        }
      }
    }

    // per-cell text labels
    if (this.tiles || this.coords) {
      draw_set_alpha(1);
      draw_set_halign(fa_center);
      draw_set_valign(fa_middle);
      for (let y = r.y0; y <= r.y1; y++) {
        for (let x = r.x0; x <= r.x1; x++) {
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
