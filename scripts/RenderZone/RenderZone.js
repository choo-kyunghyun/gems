/**
 * @typedef {Object} RenderZoneOptions
 * @property {number} [alpha] - fill alpha for zone cells (default 0.3)
 * @property {boolean} [border] - outline zone region borders (default true)
 * @property {number} [lineWidth] - border line width in world px (default 1)
 */

/**
 * world-space overlay for one ZoneMap channel: tints cells + outlines region borders. Baked into
 * one VertexBuffer — each zone's cells greedy-meshed into fill quads, each border edge a thin quad —
 * and rebuilt only when the channel's `edits` moves (or the look changes), so a frame costs one
 * submit whatever the grid size. names are a separate RenderZoneLabel pass. reads grid.zoneMap(key)
 * live; no-op when absent, so safe to insert before zones are painted.
 * @implements {RenderPass}
 */
globalThis.RenderZone = class RenderZone {
  constructor(grid, key, opt = {}) {
    this.enabled = true;
    this.grid = grid;
    this.key = key;
    this.alpha = opt.alpha ?? 0.3;
    this.border = opt.border ?? true;
    this.lineWidth = opt.lineWidth ?? 1;
    this._vb = undefined; // the bake; undefined while nothing is painted
    // what the bake was taken from: the channel instance (a re-import swaps it), its edit count,
    // and the look
    this._map = undefined;
    this._edits = -1;
    this._alpha = 0;
    this._border = false;
    this._lineWidth = 0;
  }

  destroy() {
    this._free();
  }

  _free() {
    if (this._vb !== undefined) this._vb.destroy();
    this._vb = undefined;
  }

  _color(zone) {
    const c = zone.data.color;
    // stable hue per id when no explicit color (61 ≈ prime step for spread)
    if (c === undefined) return Color.hsv((zone.id * 61) % 256, 170, 230);
    return Color.parse(c);
  }

  _fresh(map) {
    return (
      map === this._map &&
      map.edits === this._edits &&
      this.alpha === this._alpha &&
      this.border === this._border &&
      this.lineWidth === this._lineWidth
    );
  }

  _rebuild(map) {
    this._free();
    this._map = map;
    this._edits = map.edits;
    this._alpha = this.alpha;
    this._border = this.border;
    this._lineWidth = this.lineWidth;

    const cw = this.grid.cellWidth;
    const ch = this.grid.cellHeight;
    const grid = map.grid;
    const cols = grid.cols;
    const rows = grid.rows;
    const lw = this.lineWidth;
    const half = lw * 0.5;
    let vb; // opened on the first quad, so an unpainted channel bakes nothing

    for (const key in map.zones) {
      const zone = map.zones[key];
      const id = zone.id;
      const col = this._color(zone);
      const rects = Grid.meshRects(cols, rows, (x, y) => grid.get(x, y) === id);
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (vb === undefined) vb = new VertexBuffer().begin();
        const x0 = r[0] * cw;
        const y0 = r[1] * ch;
        const w = r[2] * cw;
        const h = r[3] * ch;
        vb.addQuad(x0, y0, w, h, 0, 0, 0, 0, col, this.alpha);
        if (!this.border) continue;
        // a rect's edge cell borders where the cell beyond it is another zone (idAt treats OOB
        // as 0, so map edges outline too); the seam between two rects of one zone stays clear
        const gx1 = r[0] + r[2];
        const gy1 = r[1] + r[3];
        for (let x = r[0]; x < gx1; x++) {
          const wx = x * cw;
          if (map.idAt(x, r[1] - 1) !== id)
            vb.addQuad(wx, y0 - half, cw, lw, 0, 0, 0, 0, col, 1);
          if (map.idAt(x, gy1) !== id)
            vb.addQuad(wx, y0 + h - half, cw, lw, 0, 0, 0, 0, col, 1);
        }
        for (let y = r[1]; y < gy1; y++) {
          const wy = y * ch;
          if (map.idAt(r[0] - 1, y) !== id)
            vb.addQuad(x0 - half, wy, lw, ch, 0, 0, 0, 0, col, 1);
          if (map.idAt(gx1, y) !== id)
            vb.addQuad(x0 + w - half, wy, lw, ch, 0, 0, 0, 0, col, 1);
        }
      }
    }

    if (vb !== undefined) this._vb = vb.end();
  }

  draw(_entities) {
    const map = this.grid.zoneMap(this.key);
    if (map === undefined) return;
    if (!this._fresh(map)) this._rebuild(map);
    if (this._vb !== undefined) this._vb.submit(-1);
  }
};
