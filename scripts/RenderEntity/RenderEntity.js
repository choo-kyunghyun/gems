/** @implements {RenderPass} */
globalThis.RenderEntity = class RenderEntity {
  draw(world) {
    const entities = world.query(Visual, Position);
    for (const entity of entities) {
      const visual = world.get(Visual, entity);
      const pos = world.get(Position, entity);
      if (visual.speed !== 0) {
        visual.time += visual.speed * Time.raw;
        visual.subimg =
          Math.floor(visual.time) % sprite_get_number(visual.sprite);
      }
      draw_sprite_ext(
        visual.sprite,
        visual.subimg,
        pos.x,
        pos.y,
        visual.xscale,
        visual.yscale,
        visual.rot,
        visual.color,
        visual.alpha,
      );
    }
  }
};
