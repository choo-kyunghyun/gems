/**
 * Entity `Name` labels: white text centered just above each entity's box top.
 * Split out of `RenderDebugBox` (which now draws only the colored box) so labels
 * toggle independently; insert it *after* the box pass so text sits on top.
 * Position is interpolated via `PrevPosition` + `world.alpha` like the box pass.
 * @implements {RenderPass}
 */
globalThis.RenderDebugName = class RenderDebugName {
  constructor() {
    this.enabled = true;
  }

  destroy() {}

  draw(world) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();
    const halign = draw_get_halign();
    const valign = draw_get_valign();

    draw_set_alpha(1);
    draw_set_color(c_white);
    draw_set_halign(fa_center);
    draw_set_valign(fa_bottom);

    const ids = world.query(Name);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const pos = world.get(Position, id);
      if (pos === undefined) continue;
      const prev = world.get(PrevPosition, id);
      const rx =
        prev !== undefined ? prev.x + (pos.x - prev.x) * world.alpha : pos.x;
      const ry =
        prev !== undefined ? prev.y + (pos.y - prev.y) * world.alpha : pos.y;
      const bbox = world.get(BBox, id);
      const offsetY = bbox !== undefined ? bbox.y : 0;
      draw_text(rx, ry + offsetY, world.get(Name, id).name);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
    draw_set_halign(halign);
    draw_set_valign(valign);
  }
};
