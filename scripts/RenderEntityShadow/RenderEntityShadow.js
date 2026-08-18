/**
 * flat foot-shadow ellipse per visible entity; insert BEFORE RenderEntity so shadows sit under sprites.
 * one shared pass keeps art shadow-free and sizes consistent from BBox footprints.
 * @implements {RenderPass}
 */
globalThis.RenderEntityShadow = class RenderEntityShadow {
  constructor(opt) {
    opt = opt ?? {};
    this.enabled = true;
    this.alpha = opt.alpha ?? 0.26; // shadow darkness
    this.scaleX = opt.scaleX ?? 0.6; // half-width fraction of BBox width
    this.flatten = opt.flatten ?? 0.32; // height/width ratio (low ellipse)
    this.defaultRx = opt.defaultRx ?? 16; // fallback half-width when no BBox
    this._rp = { x: 0, y: 0 }; // reused lerp scratch
  }

  destroy() {}

  draw(entities) {
    const prevA = draw_get_alpha();
    draw_set_alpha(this.alpha);
    const ids = entities.query(Visual, Position);
    for (const entity of ids) {
      const visual = entities.get(entity, Visual);
      if (!visual.visible) continue;
      const rp = InterpolationSystem.lerp(entities, entity, this._rp);
      let rx = this.defaultRx;
      if (entities.get(entity, BBox) !== undefined) {
        const b = AABB.of(entities, entity);
        rx = (b.x2 - b.x1) * this.scaleX;
      }
      const ry = Math.max(3, rx * this.flatten);
      draw_ellipse_colour(
        rp.x - rx,
        rp.y - ry,
        rp.x + rx,
        rp.y + ry,
        c_black,
        c_black,
        false,
      );
    }
    draw_set_alpha(prevA);
  }
};
