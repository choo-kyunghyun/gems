/**
 * Colored-box stand-in renderer: draws each entity as a filled `Visual.color`
 * rectangle + black outline (GMRT can't render the SVG character sprites). One
 * concern — just the box. Facing markers are `RenderDebugDirection`, animator
 * state `RenderDebugAnimator`, `Name` labels `RenderDebugName`, the lime bbox
 * overlay `RenderDebugEntity`; insert those *after* this so they sit on top.
 * Position interpolates via `InterpolationSystem.lerp`.
 * @implements {RenderPass}
 */
globalThis.RenderDebugBox = class RenderDebugBox {
  constructor() {
    this.enabled = true;
    this._rp = { x: 0, y: 0 }; // reused interp scratch (no per-entity alloc)
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
