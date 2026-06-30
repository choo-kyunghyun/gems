/**
 * white Name labels above each entity's box top. insert after RenderDebugBox.
 * @implements {RenderPass}
 */
globalThis.RenderDebugName = class RenderDebugName {
  constructor() {
    this.enabled = true;
    this._rp = { x: 0, y: 0 }; // reused lerp scratch
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

    const ids = world.query(Name, Position);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const rp = InterpolationSystem.lerp(world, id, this._rp);
      const bbox = world.get(BBox, id);
      const offsetY = bbox !== undefined ? bbox.y : 0;
      draw_text(rp.x, rp.y + offsetY, world.get(Name, id).name);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
    draw_set_halign(halign);
    draw_set_valign(valign);
  }
};
