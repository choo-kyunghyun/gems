/**
 * colored-box entity stand-in (GMRT can't render the SVG character sprites). just the box —
 * facing/animator/name/bbox cues are separate RenderDebug* passes inserted after this.
 * @implements {RenderPass}
 */
globalThis.RenderDebugBox = class RenderDebugBox {
  constructor() {
    this.enabled = true;
    this._rp = { x: 0, y: 0 }; // reused lerp scratch
  }

  destroy() {}

  draw(world) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();

    const ids = world.query(Position);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const vis = world.get(Visual, id);
      if (vis === undefined || !vis.visible) continue;
      const box = world.get(BBox, id);
      if (box === undefined) continue;

      const rp = InterpolationSystem.lerp(world, id, this._rp);
      const x1 = rp.x + box.x;
      const y1 = rp.y + box.y;
      const x2 = x1 + box.width;
      const y2 = y1 + box.height;

      draw_set_alpha(vis.alpha);
      draw_set_color(vis.color);
      draw_rectangle(x1, y1, x2, y2, false);
      draw_set_alpha(1);
      draw_set_color(c_black);
      draw_rectangle(x1, y1, x2, y2, true);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
  }
};
