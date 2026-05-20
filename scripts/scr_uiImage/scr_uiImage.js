global.OBJECT_FIT = Object.freeze({
  FILL: 0,
  CONTAIN: 1,
  COVER: 2,
  NONE: 3,
  SCALE_DOWN: 4,
});

// global.UIImage = class UIImage extends UIElement {}
function uiImage(style = {}, image = {}) {
  const element = new UIElement(style);
  element.sprite = image.sprite;
  element.subimg = image.subimg ?? 0;
  element.xscale = image.xscale ?? 1;
  element.yscale = image.yscale ?? 1;
  element.rot = image.rot ?? 0;
  element.color = image.color ?? c_white;
  element.alpha = image.alpha ?? 1;
  element.speed =
    image.speed ??
    (sprite_exists(element.sprite) ? sprite_get_speed(element.sprite) : 0);
  element.fit = image.fit ?? global.OBJECT_FIT.FILL;

  element.on_update = function () {
    if (!sprite_exists(this.sprite)) return;
    if (this.speed != 0) {
      this.subimg += Time.raw * this.speed;
      this.subimg %= sprite_get_number(this.sprite);
    }
  };

  element.on_draw = function () {
    if (!sprite_exists(this.sprite)) return;
    const pos = flexpanel_node_layout_get_position(this.flexpanel, false);
    const sw = sprite_get_width(this.sprite);
    const sh = sprite_get_height(this.sprite);
    let x = pos.left;
    let y = pos.top;
    let w = pos.width;
    let h = pos.height;

    switch (this.fit) {
      case global.OBJECT_FIT.FILL:
        draw_sprite_stretched_ext(
          this.sprite,
          this.subimg,
          x,
          y,
          w,
          h,
          this.color,
          this.alpha,
        );
        break;
      case global.OBJECT_FIT.CONTAIN:
      case global.OBJECT_FIT.SCALE_DOWN:
        let scale = min(w / sw, h / sh);
        if (this.fit === global.OBJECT_FIT.SCALE_DOWN) {
          scale = Math.min(scale, this.xscale);
        }
        w = sw * scale;
        h = sh * scale;
        x += (pos.width - w) / 2;
        y += (pos.height - h) / 2;
        draw_sprite_stretched_ext(
          this.sprite,
          this.subimg,
          x,
          y,
          w,
          h,
          this.color,
          this.alpha,
        );
        break;
      case global.OBJECT_FIT.COVER:
        const scale_max = Math.max(w / sw, h / sh);
        const part_w = w / scale_max;
        const part_h = h / scale_max;
        const part_x = (sw - part_w) / 2;
        const part_y = (sh - part_h) / 2;
        draw_sprite_general(
          this.sprite,
          this.subimg,
          part_x,
          part_y,
          part_w,
          part_h,
          x,
          y,
          scale_max,
          scale_max,
          this.rot,
          this.color,
          this.color,
          this.color,
          this.color,
          this.alpha,
        );
        break;
      case global.OBJECT_FIT.NONE:
        x += (w - sw * this.xscale) / 2;
        y += (h - sh * this.yscale) / 2;
        draw_sprite_ext(
          this.sprite,
          this.subimg,
          x,
          y,
          this.xscale,
          this.yscale,
          this.rot,
          this.color,
          this.alpha,
        );
        break;
    }
  };
}
