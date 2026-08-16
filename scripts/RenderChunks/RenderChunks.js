/**
 * Insert BEFORE entity passes so ground sits under everything. The active set is bounded by
 * loadRadius, so no view culling is needed.
 * @implements {RenderPass}
 */
globalThis.RenderChunks = class RenderChunks {
  constructor(chunks, opt = {}) {
    this.enabled = true;
    this.chunks = chunks; // a ChunkManager instance
    this.font = opt.font;
    this.ground0 = opt.ground0 ?? make_colour_rgb(34, 42, 34);
    this.ground1 = opt.ground1 ?? make_colour_rgb(28, 34, 30);
    this.wallColor = opt.wallColor ?? make_colour_rgb(96, 84, 72);
    this.frozenAlpha = opt.frozenAlpha ?? 0.6; // dim frozen entities (visual LOD cue)
    // disable when TerrainStream owns the ground (RPG overworld)
    this.ground = opt.ground ?? true;
    // disable when a lit RenderWalls pass draws the streamed walls (ChunkManager.wallLayer)
    this.walls = opt.walls ?? true;
  }

  destroy() {}

  draw(_entities) {
    if (this.chunks === undefined) return;
    const color = draw_get_color();
    const alpha = draw_get_alpha();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const font = draw_get_font();
    if (this.font !== undefined) draw_set_font(this.font);

    const recs = this.chunks.records();
    const pxW = this.chunks.pxW;
    const pxH = this.chunks.pxH;
    const cw = this.chunks.cellW;
    const ch = this.chunks.cellH;

    if (this.ground)
      for (let i = 0; i < recs.length; i++) {
        const rec = recs[i];
        const gx = rec.cx * pxW;
        const gy = rec.cy * pxH;
        draw_set_alpha(1);
        draw_set_color(
          ((rec.cx + rec.cy) & 1) === 0 ? this.ground0 : this.ground1,
        );
        draw_rectangle(gx, gy, gx + pxW, gy + pxH, false);
      }

    if (this.walls)
      for (let i = 0; i < recs.length; i++) {
        const walls = recs[i].walls;
        for (let j = 0; j < walls.length; j++) {
          const r = walls[j];
          const x1 = r[0] * cw;
          const y1 = r[1] * ch;
          const x2 = x1 + r[2] * cw;
          const y2 = y1 + r[3] * ch;
          draw_set_color(this.wallColor);
          draw_rectangle(x1, y1, x2, y2, false);
          draw_set_color(c_black);
          draw_rectangle(x1, y1, x2, y2, true);
        }
      }

    draw_set_halign(fa_center);
    draw_set_valign(fa_bottom);
    for (let i = 0; i < recs.length; i++) {
      const rec = recs[i];
      if (rec.ring !== "load") continue;
      const snaps = rec.snapshots;
      for (let j = 0; j < snaps.length; j++) {
        const comps = snaps[j].components;
        const pos = comps[Position];
        const vis = comps[Visual];
        const box = comps[BBox];
        if (pos === undefined || vis === undefined || box === undefined)
          continue;
        if (!vis.visible) continue;
        const x1 = pos.x + box.x;
        const y1 = pos.y + box.y;
        const x2 = x1 + box.width;
        const y2 = y1 + box.height;
        draw_set_alpha(this.frozenAlpha * vis.alpha);
        draw_set_color(vis.color);
        draw_rectangle(x1, y1, x2, y2, false);
        draw_set_color(c_black);
        draw_rectangle(x1, y1, x2, y2, true);
        const nm = comps[Name];
        if (nm !== undefined) {
          draw_set_color(c_white);
          draw_text(pos.x, y1, nm.name);
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
