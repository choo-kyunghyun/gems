/**
 * Foot-shadow pass for sprite entities: draws a flat, semi-transparent black ellipse at each visible
 * entity's foot (its `Position` — the foot-anchored sprite origin), UNDER the entity passes. Kept as
 * ONE runtime pass rather than baked into each sprite, so (a) the sprite art is purely the entity and
 * (b) every entity grounds consistently, sized live from its footprint. A FLAT ellipse (not a soft
 * blur) by design — it suits the flat/minimal entity art.
 *
 * Insert BEFORE `RenderEntity` (after the ground/tile passes) so shadows sit on the ground, under all
 * entities. Interpolates position like `RenderEntity` so a shadow tracks a moving body. Width comes
 * from the entity's `BBox` (its footprint) when present, else `defaultRx`. Bullets/drops carry no
 * `Visual`, so the `Visual`+`Position` query skips them for free.
 *
 * @implements {RenderPass}
 */
globalThis.RenderEntityShadow = class RenderEntityShadow {
  constructor(opt) {
    opt = opt ?? {};
    this.enabled = true; // RenderPass
    this.alpha = opt.alpha ?? 0.26; // shadow darkness (black @ this alpha)
    this.scaleX = opt.scaleX ?? 0.6; // ellipse half-width as a fraction of the BBox width
    this.flatten = opt.flatten ?? 0.32; // ellipse height / width (a low, ground-hugging ellipse)
    this.defaultRx = opt.defaultRx ?? 8; // half-width for a Visual entity with no BBox
    this._rp = { x: 0, y: 0 }; // reused interp scratch (no per-entity alloc)
  }

  destroy() {}

  draw(world) {
    const prevA = draw_get_alpha();
    draw_set_alpha(this.alpha);
    const entities = world.query(Visual, Position);
    for (const entity of entities) {
      const visual = world.get(Visual, entity);
      if (!visual.visible) continue;
      const rp = InterpolationSystem.lerp(world, entity, this._rp);
      let rx = this.defaultRx;
      if (world.get(BBox, entity) !== undefined) {
        const b = AABB.of(world, entity);
        rx = (b.x2 - b.x1) * this.scaleX;
      }
      const ry = Math.max(1.5, rx * this.flatten);
      // Flat filled ellipse (both colors black) centered on the foot. draw_set_alpha carries the
      // transparency; draw_line_width_color is the known-broken GMRT primitive, not this.
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
