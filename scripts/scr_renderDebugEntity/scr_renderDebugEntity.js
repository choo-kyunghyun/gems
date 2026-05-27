/** @implements {RenderPass} */
globalThis.RenderDebugEntity = class RenderDebugEntity {
  draw() {
    const color = draw_get_color();
    const alpha = draw_get_alpha();
    const halign = draw_get_halign();
    const valign = draw_get_valign();

    draw_set_alpha(1);

    for (let index = 0; index < Position.data.length; index++) {
      const pos = Position.data[index];
      if (pos === undefined) continue;

      const hit = Hit.data[index];
      if (hit !== undefined) {
        draw_set_color(c_lime);
        draw_circle(pos.x, pos.y, hit, true);
      }

      const name = Name.data[index];
      if (name !== undefined) {
        draw_set_color(c_white);
        draw_set_halign(fa_center);
        draw_set_valign(fa_bottom);
        const offsetY = hit !== undefined ? hit : 0;
        draw_text(pos.x, pos.y - offsetY, name);
      }
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
    draw_set_halign(halign);
    draw_set_valign(valign);
  }
};
