/** @implements {RenderPass} */
globalThis.RenderDebugEntity = class RenderDebugEntity {
  draw(world) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();
    const halign = draw_get_halign();
    const valign = draw_get_valign();

    draw_set_alpha(1);

    for (const id of world.query(Position)) {
      const pos = world.get(Position, id);

      const bbox = world.get(BBox, id);
      if (bbox !== undefined) {
        draw_set_color(c_lime);
        draw_rectangle(pos.x + bbox.x, pos.y + bbox.y, pos.x + bbox.x + bbox.w, pos.y + bbox.y + bbox.h, true);
      }

      const name = world.get(Name, id);
      if (name !== undefined) {
        draw_set_color(c_white);
        draw_set_halign(fa_center);
        draw_set_valign(fa_bottom);
        const offsetY = bbox !== undefined ? bbox.y : 0;
        draw_text(pos.x, pos.y + offsetY, name.name);
      }
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
    draw_set_halign(halign);
    draw_set_valign(valign);
  }
};
