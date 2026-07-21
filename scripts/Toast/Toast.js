// timed-notification stack, standalone singleton (not UIComponent).
// ages by Time.raw so toasts survive sim pause/dilation. newest at bottom, older above.
// opts: { duration (s), type ("info"|"success"|"warn"|"error"), accent (color override) }
globalThis.Toast = {
  _items: [], // { text, accent, life, age }; oldest first

  duration: 3.0, // seconds on screen (incl. fades)
  fade: 0.3, // fade in/out time (seconds)
  maxItems: 4, // cap; oldest dropped past this

  width: 320,
  paddingX: 14,
  paddingY: 10,
  gap: 8,
  marginBottom: 24,
  stripeW: 4, // left accent stripe
  rad: 8,
  sep: -1,
  font: -1,

  textColor: Color.parse("#f1f4fa"),
  panelColor: Color.parse("#1b1e25"),
  panelAlpha: 0.96,
  borderColor: Color.parse("#3c4350"),

  accents: {
    info: Color.parse("#4a9eff"),
    success: Color.parse("#54c98a"),
    warn: Color.parse("#e0b341"),
    error: Color.parse("#e0584f"),
  },

  /** @param {string} str @param {Object} [opts] { duration, type, accent } */
  push(str, opts = {}) {
    const accent =
      opts.accent ?? Toast.accents[opts.type ?? "info"] ?? Toast.accents.info;
    Toast._items.push({
      text: str,
      accent,
      life: opts.duration ?? Toast.duration,
      age: 0,
    });
    while (Toast._items.length > Toast.maxItems) Toast._items.shift(); // drop oldest past cap
  },

  clear() {
    Toast._items = [];
  },

  /** age + cull + draw (Draw_75, after Tooltip). */
  draw() {
    const items = Toast._items;
    if (items.length === 0) return;

    // cull expired; build survivors array to avoid mutation mid-iterate
    const dt = Time.raw;
    const live = [];
    for (let i = 0; i < items.length; i++) {
      items[i].age += dt;
      if (items[i].age < items[i].life) live.push(items[i]);
    }
    Toast._items = live;
    if (live.length === 0) return;

    const font = draw_get_font();
    const alpha = draw_get_alpha();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    if (Toast.font !== -1) draw_set_font(Toast.font);
    draw_set_halign(fa_left);
    draw_set_valign(fa_top);

    const textW = Toast.width - Toast.stripeW - Toast.paddingX * 2;
    const cx = display_get_gui_width() * 0.5;
    const x = cx - Toast.width * 0.5;
    let baseline = display_get_gui_height() - Toast.marginBottom;

    // newest at bottom, older above
    for (let i = live.length - 1; i >= 0; i--) {
      const t = live[i];
      const h =
        string_height_ext(t.text, Toast.sep, textW) + Toast.paddingY * 2;

      const fadeIn = clamp(t.age / Toast.fade, 0, 1);
      const fadeOut = clamp((t.life - t.age) / Toast.fade, 0, 1);
      const a = Math.min(fadeIn, fadeOut);
      const slide = (1 - Tween.easeOutCubic(fadeIn)) * 8; // easeOutCubic rise on entry

      const top = baseline - h + slide;
      const bot = baseline + slide;

      draw_set_alpha(Toast.panelAlpha * a);
      draw_roundrect_color_ext(
        x,
        top,
        x + Toast.width,
        bot,
        Toast.rad,
        Toast.rad,
        Toast.panelColor,
        Toast.panelColor,
        false,
      );

      draw_set_alpha(a);
      draw_roundrect_color_ext(
        x,
        top,
        x + Toast.width,
        bot,
        Toast.rad,
        Toast.rad,
        Toast.borderColor,
        Toast.borderColor,
        true,
      );

      draw_rectangle_color(
        x,
        top,
        x + Toast.stripeW,
        bot,
        t.accent,
        t.accent,
        t.accent,
        t.accent,
        false,
      );

      draw_text_ext_color(
        x + Toast.stripeW + Toast.paddingX,
        top + Toast.paddingY,
        t.text,
        Toast.sep,
        textW,
        Toast.textColor,
        Toast.textColor,
        Toast.textColor,
        Toast.textColor,
        a,
      );

      baseline = top - Toast.gap - slide;
    }

    if (Toast.font !== -1) draw_set_font(font);
    draw_set_alpha(alpha);
    draw_set_halign(halign);
    draw_set_valign(valign);
  },
};
