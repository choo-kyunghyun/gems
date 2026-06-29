/**
 * Debug overlay: each entity's current Animator.state as a yellow label below its box.
 * Insert after the box pass; position interpolates via InterpolationSystem.lerp.
 * @implements {RenderPass}
 */
globalThis.RenderDebugAnimator = class RenderDebugAnimator {
  constructor() {
    this.enabled = true;
    this._rp = { x: 0, y: 0 }; // reused interp scratch (no per-entity alloc)
  }

  destroy() {}

  draw(world) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();
    const halign = draw_get_halign();
    const valign = draw_get_valign();

    draw_set_alpha(1);
    draw_set_color(c_yellow);
    draw_set_halign(fa_center);
    draw_set_valign(fa_top);

    const ids = world.query(Animator, Position);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const anim = world.get(Animator, id);
      if (anim.state === undefined) continue;
      const box = world.get(BBox, id);
      if (box === undefined) continue;

      const rp = InterpolationSystem.lerp(world, id, this._rp);
      const cx = rp.x + box.x + box.width * 0.5;
      const by = rp.y + box.y + box.height;
      draw_text(cx, by + 1, anim.state);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
    draw_set_halign(halign);
    draw_set_valign(valign);
  }
};
