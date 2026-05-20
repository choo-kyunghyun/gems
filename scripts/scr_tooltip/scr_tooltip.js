global.Tooltip = class Tooltip {
  static text = "";
  static text_color = "#ffffff";
  static text_alpha = 1;
  static sep = -1;
  static w = 640;
  static font = -1;
  static panel_color = "#121212";
  static panel_alpha = 1;
  static panel_rad = 8;
  static padding_x = 12;
  static padding_y = 8;
  static offset_x = 36;
  static offset_y = 36;

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

    let x = device_mouse_x_to_gui(0) + Tooltip.offset_x;
    let y = device_mouse_y_to_gui(0) + Tooltip.offset_y;
    const width =
      string_width_ext(Tooltip.text, Tooltip.sep, Tooltip.w) +
      Tooltip.padding_x * 2;
    const height =
      string_height_ext(Tooltip.text, Tooltip.sep, Tooltip.w) +
      Tooltip.padding_y * 2;
    x = clamp(x, 0, display_get_gui_width() - width);
    y = clamp(y, 0, display_get_gui_height() - height);

    draw_set_alpha(Tooltip.panel_alpha);

    draw_roundrect_color_ext(
      x,
      y,
      x + width,
      y + height,
      Tooltip.panel_rad,
      Tooltip.panel_rad,
      Tooltip.panel_color,
      Tooltip.panel_color,
      false,
    );

    draw_set_halign(fa_left);
    draw_set_valign(fa_top);
    draw_set_alpha(Tooltip.text_alpha);

    draw_text_ext_color(
      x + Tooltip.padding_x,
      y + Tooltip.padding_y,
      Tooltip.text,
      Tooltip.sep,
      Tooltip.w,
      Tooltip.text_color,
      Tooltip.text_color,
      Tooltip.text_color,
      Tooltip.text_color,
      Tooltip.text_alpha,
    );

    Tooltip.clear();

    if (Tooltip.font !== -1) draw_set_font(font);
    draw_set_alpha(alpha);
    draw_set_halign(halign);
    draw_set_valign(valign);
  }
};
