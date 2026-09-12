// A draw_primitive batch silently drops every vertex past the 1000th (docs/GMRT.md), so the
// walk re-opens the linelist on that boundary: 8 vertices a box, 125 boxes a batch.
const BATCH_VERTS = 1000;

/**
 * lime BBox outlines, one linelist batch per 125 entities. insert after the entity pass.
 * @implements {RenderPass}
 */
globalThis.RenderDebugEntity = class RenderDebugEntity {
  constructor() {
    // overlay scenes insert this disabled and flip it to inspect; RTS keeps it
    // enabled as its only entity renderer.
    this.enabled = true;
    this._rp = { x: 0, y: 0 }; // reused lerp scratch
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
      const e = AABB.edges(
        InterpolationSystem.lerp(entities, id, this._rp),
        bbox,
      );
      draw_vertex(e.x1, e.y1);
      draw_vertex(e.x2, e.y1);
      draw_vertex(e.x2, e.y1);
      draw_vertex(e.x2, e.y2);
      draw_vertex(e.x1, e.y2);
      draw_vertex(e.x2, e.y2);
      draw_vertex(e.x1, e.y1);
      draw_vertex(e.x1, e.y2);
      verts += 8;
    }
    draw_primitive_end();

    draw_set_color(color);
    draw_set_alpha(alpha);
  }
};
