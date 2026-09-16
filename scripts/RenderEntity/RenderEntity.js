/** @implements {RenderPass} */
globalThis.RenderEntity = class RenderEntity {
  constructor() {
    this.enabled = true;
  }

  destroy() {}

  draw(entities) {
    entities.forEach([Visual, Position], (entity, visual, rp) => {
      const rx = rp.x;
      const ry = rp.y;
      // an invalid sprite — or an SVG one, which exists but reports 0 frames on GMRT — draws
      // as the pixMissing placeholder. Stretched over the BBox when present (so a body keeps
      // its physical extent legible), else at Position.
      if (
        !sprite_exists(visual.sprite) ||
        sprite_get_number(visual.sprite) < 1
      ) {
        const box = entities.get(entity, BBox);
        if (box !== undefined) {
          draw_sprite_stretched_ext(
            pixMissing,
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
            pixMissing,
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
        return;
      }
      draw_sprite_ext(
        visual.sprite,
        Animation.advance(visual, visual.sprite),
        rx,
        ry,
        visual.xscale,
        visual.yscale,
        visual.rot,
        visual.color,
        visual.alpha,
      );
    });
  }
};
