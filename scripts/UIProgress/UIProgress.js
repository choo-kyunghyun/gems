// Non-interactive 0..1 fill bar (health, mana, loading). Read-only, so no onUpdate.
// Style structs mirror UISlider: { color, rad?, border?, borderColor? }.
/** @implements {UIComponent} */
globalThis.UIProgress = class UIProgress {
  /** @param {Object} [progress] { getValue|value, label, track, fill, color, font } */
  constructor(progress = {}) {
    this._get = progress.getValue ?? (() => progress.value ?? 0); // static or live, 0..1
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
    const a0 = draw_get_alpha();
    draw_set_alpha(1);

    const x1 = pos.left;
    const y1 = pos.top;
    const x2 = pos.left + pos.width;
    const y2 = pos.top + pos.height;
    const rad = this._trackStyle.rad ?? Math.min(pos.height, pos.width) * 0.5;

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

    // right edge held >= x1 + 2*rad so the rounded caps can't invert at tiny values.
    const t = clamp(this._get(), 0, 1);
    if (t > 0) {
      const fillCol = this._fillStyle.color ?? c_white;
      // draw_roundrect's two colors run center→edge (radial), so color2 is an edge tint,
      // not a left→right gradient — see the UIPanel note in CLAUDE.md.
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

    // outline over the fill so it frames the whole track.
    if (this._trackStyle.border) {
      const bc = this._trackStyle.borderColor ?? c_black;
      draw_roundrect_color_ext(x1, y1, x2, y2, rad, rad, bc, bc, true);
    }

    if (this.label) {
      const str = this.label();
      if (str !== "") {
        const font = draw_get_font();
        const fnt = resolveUIFont(this.font);
        if (fnt !== -1) draw_set_font(fnt);
        const ha = draw_get_halign();
        const va = draw_get_valign();
        draw_set_halign(fa_center);
        draw_set_valign(fa_middle);
        draw_set_color(this.color);
        draw_text(pos.left + pos.width * 0.5, pos.top + pos.height * 0.5, str);
        draw_set_halign(ha);
        draw_set_valign(va);
        if (fnt !== -1) draw_set_font(font);
      }
    }

    draw_set_alpha(a0);
  }
};
