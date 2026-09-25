/** @implements {RenderPass} */
globalThis.RenderEntity = class RenderEntity {
  constructor() {
    this.enabled = true;
  }

  destroy() {}

  draw(entities) {
    const held = entities.column(Instance); // one index read per sprite, not a get
    const mask = Handle.INDEX_MASK;
    entities.forEach([Sprite, Position], (entity, spr, rp) => {
      if (!spr.visible) return;
      const rx = rp.x;
      const ry = rp.y;
      const h = held[entity & mask];
      if (h !== undefined && h.rigged) {
        // a skeletal body poses only through its puppet's draw_self (docs/SPINE.md)
        matrix_set(
          matrix_world,
          matrix_multiply(Anim.pose(h, spr, rp), matrix_build(rx, ry, 0, 0, 0, 0, 1, 1, 1)),
        );
        h.inst.draw_self();
        matrix_set(matrix_world, matrix_build_identity());
        return;
      }
      // an invalid or frameless (SVG, docs/GMRT.md) sprite draws as the placeholder, stretched
      // over the BBox when present so the body keeps its extent legible.
      if (!sprite_exists(spr.sprite) || sprite_get_number(spr.sprite) < 1) {
        const box = entities.get(entity, BBox);
        if (box !== undefined) {
          draw_sprite_stretched_ext(
            pixMissing,
            0,
            rx + box.x,
            ry + box.y,
            box.width,
            box.height,
            spr.blend,
            spr.alpha,
          );
        } else {
          draw_sprite_ext(
            pixMissing,
            0,
            rx,
            ry,
            spr.xscale,
            spr.yscale,
            spr.angle,
            spr.blend,
            spr.alpha,
          );
        }
        return;
      }
      draw_sprite_ext(
        spr.sprite,
        spr.index,
        rx,
        ry,
        spr.xscale,
        spr.yscale,
        spr.angle,
        spr.blend,
        spr.alpha,
      );
    });
  }
};
