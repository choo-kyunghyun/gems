// Tooltip — single-slot hover hint, a standalone static singleton (NOT a UIComponent). Any code
// calls Tooltip.set(str) during update; Tooltip.draw() (obj_game Draw_75, before Toast) renders
// it once at the mouse and clears it, so a tooltip shows only while something keeps re-setting it
// each frame (see UITooltip's dwell timer).
globalThis.Tooltip = class Tooltip {
  static text = "";
  static textColor = Color.parse("#f1f4fa");
  static textAlpha = 1;
  static sep = -1;
  static w = 640;
  static font = -1;
  static panelColor = Color.parse("#1b1e25");
  static panelAlpha = 0.96;
  static panelRad = 8;
  static borderColor = Color.parse("#3c4350");
  static borderAlpha = 1;
  static paddingX = 12;
  static paddingY = 8;
  static offsetX = 22;
  static offsetY = 24;

  /** Set the tooltip text for this frame (drawn + cleared by draw()). @param {string} str */
  static set(str) {
    Tooltip.text = str;
  }

  /** Clear the pending tooltip text. */
  static clear() {
    Tooltip.text = "";
  }

  /** Draw the pending tooltip at the cursor, then clear it (Draw_75). */
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

    draw_set_alpha(Tooltip.borderAlpha);
    draw_roundrect_color_ext(
      x,
      y,
      x + width,
      y + height,
      Tooltip.panelRad,
      Tooltip.panelRad,
      Tooltip.borderColor,
      Tooltip.borderColor,
      true,
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
