/** @implements {RenderPass} */
globalThis.RenderDebugEntity = class RenderDebugEntity {
  destroy() {}

  draw(world) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();
    const halign = draw_get_halign();
    const valign = draw_get_valign();

    draw_set_alpha(1);

    for (const id of world.query(Position)) {
      const pos = world.get(Position, id);
      const prev = world.get(PrevPosition, id);
      const rx =
        prev !== undefined ? prev.x + (pos.x - prev.x) * world.alpha : pos.x;
      const ry =
        prev !== undefined ? prev.y + (pos.y - prev.y) * world.alpha : pos.y;

      const bbox = world.get(BBox, id);
      if (bbox !== undefined) {
        const e = AABB.edges({ x: rx, y: ry }, bbox);
        draw_set_color(c_lime);
        draw_rectangle(e.x1, e.y1, e.x2, e.y2, true);
      }

      const name = world.get(Name, id);
      if (name !== undefined) {
        draw_set_color(c_white);
        draw_set_halign(fa_center);
        draw_set_valign(fa_bottom);
        const offsetY = bbox !== undefined ? bbox.y : 0;
        draw_text(rx, ry + offsetY, name.name);
      }
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
    draw_set_halign(halign);
    draw_set_valign(valign);
  }
};
