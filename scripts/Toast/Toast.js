/**
 * Toast — a timed-notification stack, standalone static singleton mirroring
 * Tooltip (NOT a UIComponent). Push from anywhere with `Toast.push(str, opts)`;
 * `Toast.draw()` runs once per frame in obj_game Draw_75 (after Tooltip), ages each
 * entry by Time.raw (wall-clock, so toasts don't freeze/slow when a sim dilates or
 * pauses time — same rule as the UI timers) and draws the live stack.
 *
 * Stack: newest at the bottom of the screen, older entries above it; an entry fades
 * + slides in on arrival and fades out as it expires, then is removed. Variable
 * heights are handled by accumulating offsets from the baseline up.
 *
 * `opts`: { duration (s), type ("info"|"success"|"warn"|"error"), accent (color int
 * override) }. Type selects the left accent stripe color.
 */
globalThis.Toast = class Toast {
  static _items = []; // oldest first; { text, accent, life, age }

  static duration = 3.0; // seconds on screen (incl. fades)
  static fade = 0.3; // fade in/out time (seconds)
  static maxItems = 4; // cap; oldest dropped past this

  static width = 320;
  static paddingX = 14;
  static paddingY = 10;
  static gap = 8;
  static marginBottom = 24;
  static stripeW = 4; // left accent stripe
  static rad = 8;
  static sep = -1;
  static font = -1;

  static textColor = Color.parse("#f1f4fa");
  static panelColor = Color.parse("#1b1e25");
  static panelAlpha = 0.96;
  static borderColor = Color.parse("#3c4350");

  static accents = {
    info: Color.parse("#4a9eff"),
    success: Color.parse("#54c98a"),
    warn: Color.parse("#e0b341"),
    error: Color.parse("#e0584f"),
  };

  static push(str, opts = {}) {
    const accent =
      opts.accent ?? Toast.accents[opts.type ?? "info"] ?? Toast.accents.info;
    Toast._items.push({
      text: str,
      accent,
      life: opts.duration ?? Toast.duration,
      age: 0,
    });
    // Drop the oldest if we exceed the cap.
    while (Toast._items.length > Toast.maxItems) Toast._items.shift();
  }

  static clear() {
    Toast._items = [];
  }

  static draw() {
    const items = Toast._items;
    if (items.length === 0) return;

    // Age + cull expired (build survivors; no Array mutation mid-iterate).
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

    // Draw newest (last) at the bottom, walking upward.
    for (let i = live.length - 1; i >= 0; i--) {
      const t = live[i];
      const h =
        string_height_ext(t.text, Toast.sep, textW) + Toast.paddingY * 2;

      // Fade in over the first `fade`, out over the last `fade`.
      const fadeIn = clamp(t.age / Toast.fade, 0, 1);
      const fadeOut = clamp((t.life - t.age) / Toast.fade, 0, 1);
      const a = Math.min(fadeIn, fadeOut);
      // Rise into place on entry, decelerating (easeOutCubic) so it settles smoothly.
      const slide = (1 - Tween.easeOutCubic(fadeIn)) * 8;

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

      // Left accent stripe.
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
  }
};
