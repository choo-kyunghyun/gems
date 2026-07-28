// standalone singleton (not UIComponent). set() each frame to show; draw() renders + clears.
// visible only while something re-sets it each frame (see UITooltip's dwell timer).
globalThis.Tooltip = {
  text: "",
  textColor: Color.parse("#f1f4fa"),
  textAlpha: 1,
  sep: -1,
  w: 640,
  font: -1,
  panelColor: Color.parse("#1b1e25"),
  panelAlpha: 0.96,
  panelRad: 8,
  borderColor: Color.parse("#3c4350"),
  borderAlpha: 1,
  paddingX: 12,
  paddingY: 8,
  offsetX: 22,
  offsetY: 24,

  /** @param {string} str */
  set(str) {
    Tooltip.text = str;
  },

  clear() {
    Tooltip.text = "";
  },

  /** draw at cursor then clear (Draw_75). */
  draw() {
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

    drawUIPanel(x, y, x + width, y + height, Tooltip.panelRad, Tooltip);

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
  },
};
