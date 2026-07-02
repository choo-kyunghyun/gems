/**
 * draws Visual+Position entities via draw_sprite_ext with lerp'd position and looped anim.
 * @implements {RenderPass}
 */
globalThis.RenderEntity = class RenderEntity {
  constructor() {
    this.enabled = true;
    this._rp = { x: 0, y: 0 }; // reused lerp scratch
  }

  destroy() {}

  draw(world) {
    const entities = world.query(Visual, Position);
    for (const entity of entities) {
      const visual = world.get(Visual, entity);
      const rp = InterpolationSystem.lerp(world, entity, this._rp);
      const rx = rp.x;
      const ry = rp.y;
      // an invalid sprite — or an SVG one, which exists but reports 0 frames on GMRT — draws
      // as the spr_missing placeholder. Stretched over the BBox when present (so bodies like
      // the platformer's platforms keep their physical extent legible), else at Position.
      if (
        !sprite_exists(visual.sprite) ||
        sprite_get_number(visual.sprite) < 1
      ) {
        const box = world.get(BBox, entity);
        if (box !== undefined) {
          draw_sprite_stretched_ext(
            spr_missing,
            0,
            rx + box.x,
            ry + box.y,
            box.width,
            box.height,
            visual.color,
            visual.alpha,
          );
        } else {
          draw_sprite_ext(
            spr_missing,
            0,
            rx,
            ry,
            visual.xscale,
            visual.yscale,
            visual.rot,
            visual.color,
            visual.alpha,
          );
        }
        continue;
      }
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
