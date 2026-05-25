/** @implements {Component} */
globalThis.UIText = class UIText {
  constructor(text = {}) {
    this.textRef = text.textRef ?? (() => "");
    this.halign = text.halign ?? fa_left;
    this.xscale = text.xscale ?? 1;
    this.yscale = text.yscale ?? 1;
    this.angle = text.angle ?? 0;
    this.color = text.color ?? c_white;
    this.alpha = text.alpha ?? 1;
    this.sep = text.sep ?? -1;
    this.w = text.w ?? 0;
    this.font = text.font ?? -1;
    this.cache = "";
  }

  /**
   * @param {UIElement} element
   * @param {boolean} block
   * @returns {boolean}
   */
  onUpdate(element, block) {
    const str = this.textRef();
    if (this.cache !== str) {
      this.cache = str;

      const font = draw_get_font();
      if (this.font !== -1) draw_set_font(this.font);

      let width = 0;
      let height = 0;

      if (this.w > 0) {
        width = string_width_ext(this.cache, this.sep, this.w);
        height = string_height_ext(this.cache, this.sep, this.w);
      } else {
        width = string_width(this.cache);
        height = string_height(this.cache);
      }

      if (
        element.get_width().value != width ||
        element.get_height().value != height
      ) {
        element.set_width(width, flexpanel_unit.point);
        element.set_height(height, flexpanel_unit.point);
      }

      if (this.font !== -1) draw_set_font(font);
    }
    return block;
  }

  /**
   * @param {UIElement} element
   */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    let x = pos.left;
    let y = pos.top;

    const font = draw_get_font();
    if (this.font !== -1) draw_set_font(this.font);

    const halign = draw_get_halign();

    if (this.w > 0) {
      draw_set_halign(this.halign);
      if (this.halign === fa_center) x += pos.width / 2;
      else if (this.halign === fa_right) x += pos.width;
    }

    if (this.w > 0) {
      draw_text_ext_transformed_color(
        x,
        y,
        this.cache,
        this.sep,
        this.w,
        this.xscale,
        this.yscale,
        this.angle,
        this.color,
        this.color,
        this.color,
        this.color,
        this.alpha,
      );
    } else {
      draw_text_transformed_color(
        x,
        y,
        this.cache,
        this.xscale,
        this.yscale,
        this.angle,
        this.color,
        this.color,
        this.color,
        this.color,
        this.alpha,
      );
    }

    if (this.w > 0) draw_set_halign(halign);
    if (this.font !== -1) draw_set_font(font);
  }
};
