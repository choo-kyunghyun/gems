/**
 * facing dot offset from each box center toward its Direction. insert after RenderDebugBox.
 * @implements {RenderPass}
 */
globalThis.RenderDebugDirection = class RenderDebugDirection {
  constructor() {
    this.enabled = true;
    this._rp = { x: 0, y: 0 }; // reused lerp scratch
  }

  destroy() {}

  draw(world) {
    const color = draw_get_color();
    const alpha = draw_get_alpha();

    draw_set_alpha(1);
    draw_set_color(c_black);

    const ids = world.query(Direction, Position);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const dir = world.get(Direction, id);
      if (dir.x === 0 && dir.y === 0) continue;
      const vis = world.get(Visual, id);
      if (vis === undefined || !vis.visible) continue;
      const box = world.get(BBox, id);
      if (box === undefined) continue;

      const rp = InterpolationSystem.lerp(world, id, this._rp);
      const mx = rp.x + box.x + box.width * 0.5;
      const my = rp.y + box.y + box.height * 0.5;
      const r = box.width * 0.5;
      draw_circle(mx + dir.x * r * 0.6, my + dir.y * r * 0.6, 3, false);
    }

    draw_set_color(color);
    draw_set_alpha(alpha);
  }
};
