globalThis.Tooltip = class Tooltip {
  static text = "";
  static textColor = Color.parse("#ffffff");
  static textAlpha = 1;
  static sep = -1;
  static w = 640;
  static font = -1;
  static panelColor = Color.parse("#121212");
  static panelAlpha = 1;
  static panelRad = 8;
  static paddingX = 12;
  static paddingY = 8;
  static offsetX = 36;
  static offsetY = 36;

  static set(str) {
    Tooltip.text = str;
  }

  static clear() {
    Tooltip.text = "";
  }

  static draw() {
    if (Tooltip.text === "") return;

    const font = draw_get_font();
    const alpha = draw_get_alpha();
    const halign = draw_get_halign();
    const valign = draw_get_valign();

    if (Tooltip.font !== -1) draw_set_font(Tooltip.font);

    let x = device_mouse_x_to_gui(0) + Tooltip.offsetX;
    let y = device_mouse_y_to_gui(0) + Tooltip.offsetY;
    const width =
      string_width_ext(Tooltip.text, Tooltip.sep, Tooltip.w) +
      Tooltip.paddingX * 2;
    const height =
      string_height_ext(Tooltip.text, Tooltip.sep, Tooltip.w) +
      Tooltip.paddingY * 2;
    x = clamp(x, 0, display_get_gui_width() - width);
    y = clamp(y, 0, display_get_gui_height() - height);

    draw_set_alpha(Tooltip.panelAlpha);

    draw_roundrect_color_ext(
      x,
      y,
      x + width,
      y + height,
      Tooltip.panelRad,
      Tooltip.panelRad,
      Tooltip.panelColor,
      Tooltip.panelColor,
      false,
    );

    draw_set_halign(fa_left);
    draw_set_valign(fa_top);
    draw_set_alpha(Tooltip.textAlpha);

    draw_text_ext_color(
      x + Tooltip.paddingX,
      y + Tooltip.paddingY,
      Tooltip.text,
      Tooltip.sep,
      Tooltip.w,
      Tooltip.textColor,
      Tooltip.textColor,
      Tooltip.textColor,
      Tooltip.textColor,
      Tooltip.textAlpha,
    );

    Tooltip.clear();

    if (Tooltip.font !== -1) draw_set_font(font);
    draw_set_alpha(alpha);
    draw_set_halign(halign);
    draw_set_valign(valign);
  }
};
