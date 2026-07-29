/** CSS object-fit modes for how a sprite fills its element rect. */
globalThis.OBJECT_FIT = Object.freeze({
  FILL: 0,
  CONTAIN: 1,
  COVER: 2,
  NONE: 3,
  SCALE_DOWN: 4,
});

// draws a sprite into the element rect per OBJECT_FIT, optionally animating on Time.raw.
// guards sprite_exists throughout (GMRT returns 0 frames for SVG sprites — see CLAUDE.md).
/** @implements {UIComponent} */
globalThis.UIImage = class UIImage {
  /** @param {Object} [image] { sprite, subimg, xscale, yscale, rot, color, alpha, speed, fit } */
  constructor(image = {}) {
    this.sprite = image.sprite;
    this.subimg = image.subimg ?? 0;
    this.xscale = image.xscale ?? 1;
    this.yscale = image.yscale ?? 1;
    this.rot = image.rot ?? 0;
    this.color = image.color ?? c_white;
    this.alpha = image.alpha ?? 1;
    this.speed =
      image.speed ??
      (sprite_exists(this.sprite) ? sprite_get_speed(this.sprite) : 0);
    this.fit = image.fit ?? OBJECT_FIT.FILL;
  }

  /**
   * advance the subimage if `speed` is set.
   * @param {UIElement} element
   * @param {boolean} block
   * @returns {boolean}
   */
  onUpdate(element, block) {
    if (!sprite_exists(this.sprite)) return block;
    if (this.speed != 0) {
      this.subimg += Time.raw * this.speed;
      this.subimg %= sprite_get_number(this.sprite);
    }
    return block;
  }

  /** @param {UIElement} element */
  onDraw(element) {
    if (!sprite_exists(this.sprite)) return;
    // getLayoutPosition so the image inherits ancestor scroll offset.
    const pos = element.getLayoutPosition();
    const sw = sprite_get_width(this.sprite);
    const sh = sprite_get_height(this.sprite);
    let x = pos.left;
    let y = pos.top;
    let w = pos.width;
    let h = pos.height;

    switch (this.fit) {
      case OBJECT_FIT.FILL:
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
      case OBJECT_FIT.CONTAIN:
      case OBJECT_FIT.SCALE_DOWN:
        const fit = uiContainRect(
          sw,
          sh,
          x,
          y,
          w,
          h,
          this.fit === OBJECT_FIT.SCALE_DOWN ? this.xscale : 0,
        );
        draw_sprite_stretched_ext(
          this.sprite,
          this.subimg,
          fit.x,
          fit.y,
          fit.w,
          fit.h,
          this.color,
          this.alpha,
        );
        break;
      case OBJECT_FIT.COVER:
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
      case OBJECT_FIT.NONE:
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
  }
};
