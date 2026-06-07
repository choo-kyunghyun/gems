/** @implements {RenderPass} */
globalThis.RenderDebugEntity = class RenderDebugEntity {
  destroy() {}

  draw(world) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();
    const halign = draw_get_halign();
    const valign = draw_get_valign();

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
      const rx = prev !== undefined ? prev.x + (pos.x - prev.x) * world.alpha : pos.x;
      const ry = prev !== undefined ? prev.y + (pos.y - prev.y) * world.alpha : pos.y;
      const e = AABB.edges({ x: rx, y: ry }, bbox);
      draw_vertex(e.x1, e.y1); draw_vertex(e.x2, e.y1);
      draw_vertex(e.x2, e.y1); draw_vertex(e.x2, e.y2);
      draw_vertex(e.x1, e.y2); draw_vertex(e.x2, e.y2);
      draw_vertex(e.x1, e.y1); draw_vertex(e.x1, e.y2);
    }
    draw_primitive_end();

    // Name labels: immediate-mode, only present on a small subset of entities.
    draw_set_color(c_white);
    draw_set_halign(fa_center);
    draw_set_valign(fa_bottom);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const name = world.get(Name, id);
      if (name === undefined) continue;
      const pos = world.get(Position, id);
      const prev = world.get(PrevPosition, id);
      const rx = prev !== undefined ? prev.x + (pos.x - prev.x) * world.alpha : pos.x;
      const ry = prev !== undefined ? prev.y + (pos.y - prev.y) * world.alpha : pos.y;
      const bbox = world.get(BBox, id);
      const offsetY = bbox !== undefined ? bbox.y : 0;
      draw_text(rx, ry + offsetY, name.name);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
    draw_set_halign(halign);
    draw_set_valign(valign);
  }
};
