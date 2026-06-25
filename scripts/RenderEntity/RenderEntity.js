/**
 * Production entity renderer: draws every entity with `Visual` + `Position` via
 * `draw_sprite_ext`, advancing looped sprite playback and interpolating position
 * through `InterpolationSystem.lerp`.
 * @implements {RenderPass}
 */
globalThis.RenderEntity = class RenderEntity {
  constructor() {
    this.enabled = true;
    this._rp = { x: 0, y: 0 }; // reused interp scratch (no per-entity alloc)
  }

  destroy() {}

  draw(world) {
    const entities = world.query(Visual, Position);
    for (const entity of entities) {
      const visual = world.get(Visual, entity);
      const rp = InterpolationSystem.lerp(world, entity, this._rp);
      const rx = rp.x;
      const ry = rp.y;
      if (visual.speed !== 0) {
        visual.time += visual.speed * Time.raw;
        visual.subimg =
          Math.floor(visual.time) % sprite_get_number(visual.sprite);
      }
      draw_sprite_ext(
        visual.sprite,
        visual.subimg,
        rx,
        ry,
        visual.xscale,
        visual.yscale,
        visual.rot,
        visual.color,
        visual.alpha,
      );
    }
  }
};
