/** @implements {RenderPass} */
globalThis.RenderEntity = class RenderEntity {
  draw() {
    for (let index = 0; index < Visual.data.length; index++) {
      const visual = Visual.data[index];
      if (visual === undefined) continue;
      const pos = Position.data[index];
      if (pos !== undefined) {
        draw_sprite_ext(visual.sprite, visual.subimg, pos.x, pos.y, visual.xscale, visual.yscale, visual.rot, visual.color, visual.alpha);
      }
    }
  }
};
