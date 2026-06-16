/**
 * @implements {UIComponent}
 * Non-interactive progress / fill bar (health, mana, XP, loading, cooldown). Reads a
 * live 0..1 value each frame and draws a rounded track with a left-anchored fill.
 * Pure readout — no input handling, so onUpdate is omitted. Optional centered label
 * (string or () => string, e.g. a percentage or "50 / 100").
 *
 * Style structs mirror UISlider: { color, rad?, border?, borderColor? }. Everything is
 * drawn directly in onDraw (immediate-mode) — no child UIElements.
 */
globalThis.UIProgress = class UIProgress {
  /** @param {Object} [progress] { getValue|value, label, track, fill, color, font } */
  constructor(progress = {}) {
    // Static `value` or a live `getValue()` — either way treated as 0..1.
    this._get = progress.getValue ?? (() => progress.value ?? 0);
    const label = progress.label;
    this.label =
      label != null
        ? typeof label === "function"
          ? label
          : () => label
        : null;

    this._trackStyle = progress.track ?? {};
    this._fillStyle = progress.fill ?? {};
    this.color = progress.color ?? c_white; // label color
    this.font = progress.font ?? -1;
  }

  /** @param {UIElement} element */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return; // unlaid-out (NaN) or zero-width — NaN <= 0 is false

    const a0 = draw_get_alpha();
    draw_set_alpha(1);

    const x1 = pos.left;
    const y1 = pos.top;
    const x2 = pos.left + pos.width;
    const y2 = pos.top + pos.height;
    const rad = this._trackStyle.rad ?? Math.min(pos.height, pos.width) * 0.5;

    // Track.
    const trackCol = this._trackStyle.color ?? c_dkgray;
    draw_roundrect_color_ext(
      x1,
      y1,
      x2,
      y2,
      rad,
      rad,
      trackCol,
      trackCol,
      false,
    );

    // Fill from the left. The right edge is held at >= x1 + 2*rad so the rounded caps
    // never invert at tiny values, and clamped to x2 at the top end.
    const t = clamp(this._get(), 0, 1);
    if (t > 0) {
      const fillCol = this._fillStyle.color ?? c_white;
      // draw_roundrect's two colors run center→edge (radial), so color2 reads as an
      // edge tint, not a left→right gradient — see the UIPanel note in CLAUDE.md.
      const fillCol2 = this._fillStyle.color2 ?? fillCol;
      const fx = clamp(x1 + pos.width * t, x1 + rad * 2, x2);
      draw_roundrect_color_ext(
        x1,
        y1,
        fx,
        y2,
        rad,
        rad,
        fillCol,
        fillCol2,
        false,
      );
    }

    // Border outline (drawn over the fill so it frames the whole track).
    if (this._trackStyle.border) {
      const bc = this._trackStyle.borderColor ?? c_black;
      draw_roundrect_color_ext(x1, y1, x2, y2, rad, rad, bc, bc, true);
    }

    // Centered label.
    if (this.label) {
      const str = this.label();
      if (str !== "") {
        const font = draw_get_font();
        if (this.font !== -1) draw_set_font(this.font);
        const ha = draw_get_halign();
        const va = draw_get_valign();
        draw_set_halign(fa_center);
        draw_set_valign(fa_middle);
        draw_set_color(this.color);
        draw_text(pos.left + pos.width * 0.5, pos.top + pos.height * 0.5, str);
        draw_set_halign(ha);
        draw_set_valign(va);
        if (this.font !== -1) draw_set_font(font);
      }
    }

    draw_set_alpha(a0);
  }
};
