// global.UIText = class UIText extends UIElement {}
function uiText(style = {}, text = {}) {
  const element = new UIElement(style);
  element.text_ref =
    text.text_ref ??
    function () {
      return "";
    };
  element.halign = text.halign ?? fa_left;
  element.xscale = text.xscale ?? 1;
  element.yscale = text.yscale ?? 1;
  element.angle = text.angle ?? 0;
  element.color = text.color ?? c_white;
  element.alpha = text.alpha ?? 1;
  element.sep = text.sep ?? -1;
  element.w = text.w ?? 0;
  element.font = text.font ?? -1;
  element.cache = "";

  element.on_update = function () {
    const str = this.text_ref();
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
        this.get_width().value != width ||
        this.get_height().value != height
      ) {
        this.set_width(width, flexpanel_unit.point);
        this.set_height(height, flexpanel_unit.point);
      }

      if (this.font !== -1) draw_set_font(font);
    }
  };

  element.on_draw = function () {
    const pos = flexpanel_node_layout_get_position(this.flexpanel, false);
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

    draw_set_halign(halign);

    if (this.font !== -1) draw_set_font(font);
  };

  return element;
}
