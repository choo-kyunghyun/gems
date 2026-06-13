/** @implements {RenderPass} */
globalThis.RenderEntity = class RenderEntity {
  constructor() {
    this.enabled = true;
  }

  destroy() {}

  draw(world) {
    const entities = world.query(Visual, Position);
    for (const entity of entities) {
      const visual = world.get(Visual, entity);
      const pos = world.get(Position, entity);
      const prev = world.get(PrevPosition, entity);
      const rx =
        prev !== undefined ? prev.x + (pos.x - prev.x) * world.alpha : pos.x;
      const ry =
        prev !== undefined ? prev.y + (pos.y - prev.y) * world.alpha : pos.y;
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
