/**
 * @implements {UIComponent}
 * Tab strip — lives on a fixed-height row element (built by gemsTabs). Draws N
 * equal-width tab segments directly in onDraw (like UISelect/UIStepper, no child
 * panels) and hit-tests clicks per segment. Selecting a tab swaps content by
 * toggling each content element's `enabled` flag — NOT by mutating flex or
 * inserting/removing nodes, so there is no reflow on switch (the content overlays
 * are all laid out once, stacked via absolute positioning by gemsTabs; only the
 * active one draws/updates).
 *
 * `tabs[i].label` is a string or () => string (live I18n.textRef). `tabs[i].content`
 * is the overlay element to show for that tab. GMRT note: hover/active state is read
 * live from pointer position each frame, so there is no cached primitive bool to be
 * clobbered, and no timer (Time.raw/delta) is involved.
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

    // Show only the active tab's content from the start.
    this._apply();
  }

  _label(i) {
    const l = this.tabs[i].label;
    return typeof l === "function" ? l() : l;
  }

  // Sync each content overlay's visibility to the active index. No flex mutation —
  // `enabled` is our own flag, gated in UIElement.update/draw, so this never reflows.
  _apply() {
    for (let i = 0; i < this.tabs.length; i++) {
      this.tabs[i].content.enabled = i === this.index;
    }
  }

  /** Switch to tab `i` (no-op if already active or out of range). @param {number} i */
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
      if (mouse_check_button_pressed(mb_left)) {
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

    if (this.font !== -1) draw_set_font(this.font);
    draw_set_halign(fa_center);
    draw_set_valign(fa_middle);

    const segW = pos.width / n;
    const cy = pos.top + pos.height * 0.5;
    const bottom = pos.top + pos.height;
    const inset = 3; // gap between adjacent tab fills
    const barH = 3; // accent underline thickness

    // Baseline rule under the whole strip.
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
        // Filled tab with rounded top corners + an accent underline.
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
      draw_text((x0 + x1) * 0.5, cy, this._label(i));
    }

    draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_color(color);
    draw_set_alpha(a0);
  }

  // UINav: left/right switches tabs (so the strip is one focus stop and horizontal
  // nav cycles it); confirm advances, wrapping. Both mark the strip focusable.
  /** @param {UIElement} element @param {number} dir -1 / +1 */
  navAxis(element, dir) {
    this.select(clamp(this.index + dir, 0, this.tabs.length - 1));
  }

  /** @param {UIElement} element */
  navActivate(element) {
    if (this.tabs.length > 0) this.select((this.index + 1) % this.tabs.length);
  }
};
