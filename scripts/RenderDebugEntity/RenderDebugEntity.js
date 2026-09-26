// A draw_primitive batch silently drops every vertex past the 1000th (docs/GMRT.md), so the
// walk re-opens the linelist on that boundary: 8 vertices a box, 125 boxes a batch.
const BATCH_VERTS = 1000;

/**
 * Debug bbox outlines. Insert after the entity pass.
 * @implements {RenderPass}
 */
globalThis.RenderDebugEntity = class RenderDebugEntity {
  constructor() {
    this.enabled = true;
  }

  destroy() {}

  draw(entities) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();

    draw_set_alpha(1);

    const ids = entities.query(Position);

    draw_set_color(c_lime);
    draw_primitive_begin(pr_linelist);
    let verts = 0;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const bbox = entities.get(id, BBox);
      if (bbox === undefined) continue;
      if (verts === BATCH_VERTS) {
        draw_primitive_end();
        draw_primitive_begin(pr_linelist);
        verts = 0;
      }
      const pos = entities.get(id, Position);
      const x1 = pos.x + bbox.x;
      const y1 = pos.y + bbox.y;
      const x2 = x1 + bbox.width;
      const y2 = y1 + bbox.height;
      draw_vertex(x1, y1);
      draw_vertex(x2, y1);
      draw_vertex(x2, y1);
      draw_vertex(x2, y2);
      draw_vertex(x1, y2);
      draw_vertex(x2, y2);
      draw_vertex(x1, y1);
      draw_vertex(x1, y2);
      verts += 8;
    }
    draw_primitive_end();

    draw_set_color(color);
    draw_set_alpha(alpha);
  }
};
