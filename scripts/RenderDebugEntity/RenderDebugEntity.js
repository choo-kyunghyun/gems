/**
 * BBox-outline debug overlay (lime). Name labels live in `RenderDebugBox`;
 * insert this *after* it so the outlines sit on top of the colored boxes.
 * @implements {RenderPass}
 */
globalThis.RenderDebugEntity = class RenderDebugEntity {
  destroy() {}

  draw(world) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();

    draw_set_alpha(1);

    const ids = world.query(Position);

    // All BBox outlines in one linelist draw call instead of N draw_rectangle calls.
    draw_set_color(c_lime);
    draw_primitive_begin(pr_linelist);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const bbox = world.get(BBox, id);
      if (bbox === undefined) continue;
      const pos = world.get(Position, id);
      const prev = world.get(PrevPosition, id);
      const rx =
        prev !== undefined ? prev.x + (pos.x - prev.x) * world.alpha : pos.x;
      const ry =
        prev !== undefined ? prev.y + (pos.y - prev.y) * world.alpha : pos.y;
      const e = AABB.edges({ x: rx, y: ry }, bbox);
      draw_vertex(e.x1, e.y1);
      draw_vertex(e.x2, e.y1);
      draw_vertex(e.x2, e.y1);
      draw_vertex(e.x2, e.y2);
      draw_vertex(e.x1, e.y2);
      draw_vertex(e.x2, e.y2);
      draw_vertex(e.x1, e.y1);
      draw_vertex(e.x1, e.y2);
    }
    draw_primitive_end();

    draw_set_color(color);
    draw_set_alpha(alpha);
  }
};
