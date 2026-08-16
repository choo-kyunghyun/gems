// Non-interactive 0..1 fill bar (health, mana, loading). Read-only, so no onUpdate.
// Style structs mirror UISlider: { color, rad?, border?, borderColor? }.
/** @implements {UIComponent} */
globalThis.UIProgress = class UIProgress {
  /** progress: { getValue|value, label, track, fill, color, font } */
  constructor(progress = {}) {
    this._get = progress.getValue ?? (() => progress.value ?? 0); // static or live, 0..1
    this.label = progress.label != null ? uiTextRef(progress.label) : null;

    this._trackStyle = progress.track ?? {};
    this._fillStyle = progress.fill ?? {};
    this.color = progress.color ?? c_white; // label color
    this.font = progress.font ?? -1;
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();
    const a0 = draw_get_alpha();
    draw_set_alpha(1);

    const x1 = pos.left;
    const y1 = pos.top;
    const x2 = pos.left + pos.width;
    const y2 = pos.top + pos.height;
    const rad = this._trackStyle.rad ?? Math.min(pos.height, pos.width) * 0.5;

    // fill right edge held >= x1 + 2*rad so the rounded caps can't invert at tiny values;
    // t = 0 passes x1 (no fill). Border strokes OVER the fill so it frames the whole track.
    const t = clamp(this._get(), 0, 1);
    const fx = t > 0 ? clamp(x1 + pos.width * t, x1 + rad * 2, x2) : x1;
    drawUIBar(x1, y1, x2, y2, rad, fx, this._trackStyle, this._fillStyle, true);

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
