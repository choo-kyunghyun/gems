/**
 * @implements {UIComponent}
 * Tab strip — N equal-width segments drawn immediate-mode. Selecting swaps content by
 * each overlay's `enabled` flag, NOT flex mutation, so there is no reflow on switch
 * (overlays laid out once, stacked absolute; only the active one draws/updates).
 * `tabs[i].label` is a string or () => string; `tabs[i].content` the overlay to show.
 * GMRT: hover/active read live each frame (no cached primitive bool to clobber).
 */
globalThis.UITabs = class UITabs {
  /** @param {Object} [tabs] { tabs: {label, content}[], index, onChange, font, color, colorIdle, colorHover, activeBg, accent, border } */
  constructor(tabs = {}) {
    this.tabs = tabs.tabs ?? []; // [{ label, content }]
    this.index = tabs.index ?? 0;
    this.onChange = tabs.onChange ?? noop;
    this.font = tabs.font ?? -1;

    this.color = tabs.color ?? c_white; // active label
    this.colorIdle = tabs.colorIdle ?? c_gray; // inactive label
    this.colorHover = tabs.colorHover ?? c_white; // hovered inactive label
    this.activeBg = tabs.activeBg ?? c_dkgray; // active tab fill
    this.accent = tabs.accent ?? c_white; // active underline indicator
    this.border = tabs.border ?? c_dkgray; // baseline rule under the strip

    this._hover = -1; // hovered segment index, -1 = none

    this._apply(); // show only the active tab from the start
  }

  _label(i) {
    const l = this.tabs[i].label;
    return typeof l === "function" ? l() : l;
  }

  // sync overlay visibility to active index via `enabled` flag — never reflows.
  _apply() {
    for (let i = 0; i < this.tabs.length; i++) {
      this.tabs[i].content.enabled = i === this.index;
    }
  }

  /** @param {number} i no-op if already active or out of range */
  select(i) {
    if (i === this.index || i < 0 || i >= this.tabs.length) return;
    this.index = i;
    this._apply();
    this.onChange(i);
  }

  /** @param {UIElement} element @param {boolean} block @returns {boolean} whether the pointer is captured */
  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return block; // unlaid-out (NaN) or zero-width
    const n = this.tabs.length;
    if (n === 0) return block;

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    const inside = !block && element.positionMeeting(mx, my);

    this._hover = -1;
    if (inside) {
      const seg = clamp(floor(((mx - pos.left) / pos.width) * n), 0, n - 1);
      this._hover = seg;
      if (UIPointer.pressed) {
        this.select(seg);
        return true;
      }
    }
    return inside || block;
  }

  /** @param {UIElement} element */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return; // unlaid-out (NaN) or zero-width
    const n = this.tabs.length;
    if (n === 0) return;

    const font = draw_get_font();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const color = draw_get_color();
    const a0 = draw_get_alpha();

    // resolve I18n font KEY live (cached handle dangles on locale reload); raw handle
    // passes through. see the resolve-at-draw GMRT-Safe Idiom.
    const fnt =
      typeof this.font === "string" ? I18n.font(this.font) : this.font;
    if (fnt !== -1) draw_set_font(fnt);
    draw_set_halign(fa_center);
    draw_set_valign(fa_middle);

    const segW = pos.width / n;
    const cy = pos.top + pos.height * 0.5;
    const bottom = pos.top + pos.height;
    const inset = 3; // gap between adjacent tab fills
    const barH = 3; // accent underline thickness

    // baseline rule under the strip.
    draw_set_alpha(1);
    draw_line_color(
      pos.left,
      bottom - 1,
      pos.left + pos.width,
      bottom - 1,
      this.border,
      this.border,
    );

    for (let i = 0; i < n; i++) {
      const x0 = pos.left + i * segW;
      const x1 = x0 + segW;
      const active = i === this.index;

      if (active) {
        // filled tab + accent underline.
        draw_roundrect_color_ext(
          x0 + inset,
          pos.top,
          x1 - inset,
          bottom,
          6,
          6,
          this.activeBg,
          this.activeBg,
          false,
        );
        draw_rectangle_color(
          x0 + inset,
          bottom - barH,
          x1 - inset,
          bottom,
          this.accent,
          this.accent,
          this.accent,
          this.accent,
          false,
        );
      }

      draw_set_color(
        active
          ? this.color
          : i === this._hover
            ? this.colorHover
            : this.colorIdle,
      );
      // floor the centered anchor to integer GUI px — fractional centers soften SDF labels.
      draw_text(floor((x0 + x1) * 0.5), floor(cy), this._label(i));
    }

    // re-stroke the baseline as a trailing UNTEXTURED draw to force a texture swap that
    // flushes the rightmost label out of the pending batch — else a clip container drawn
    // right after (a gemsScroll) captures it under gpu_set_scissor and clips it away ("About"
    // tab vanished). CAN'T fix with draw_flush(): flushing before a clip's gpu_set_scissor
    // corrupts the clip on GMRT 0.20 ("No pipeline set"). redundant with the baseline above, so free.
    draw_set_alpha(1);
    draw_line_color(
      pos.left,
      bottom - 1,
      pos.left + pos.width,
      bottom - 1,
      this.border,
      this.border,
    );

    draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_color(color);
    draw_set_alpha(a0);
  }

  // UINav: left/right switches tabs (one focus stop); confirm advances, wrapping.
  /** @param {UIElement} element @param {number} dir -1 / +1 */
  navAxis(element, dir) {
    this.select(clamp(this.index + dir, 0, this.tabs.length - 1));
  }

  /** @param {UIElement} element */
  navActivate(element) {
    if (this.tabs.length > 0) this.select((this.index + 1) % this.tabs.length);
  }
};
