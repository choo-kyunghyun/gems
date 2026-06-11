/** @implements {UIComponent} */
globalThis.UIPanel = class UIPanel {
  constructor(panel = {}) {
    this.color = panel.color ?? c_white;
    // Optional bottom color for a vertical gradient. When unset, draws a solid
    // fill from the live `color` (so UIButton's per-frame color swap still works).
    this.color2 = panel.color2;
    this.alpha = panel.alpha ?? 1;
    this.rad = panel.rad ?? 0;
    // Outline drawn on top of the fill (thickness in px; 0 = none).
    this.border = panel.border ?? 0;
    this.borderColor = panel.borderColor ?? c_white;
    // Drop shadow: a filled roundrect offset behind the panel (offset px; 0 = none).
    this.shadow = panel.shadow ?? 0;
    this.shadowColor = panel.shadowColor ?? c_black;
    this.shadowAlpha = panel.shadowAlpha ?? 0.35;
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();
    const x1 = pos.left;
    const y1 = pos.top;
    const x2 = pos.left + pos.width;
    const y2 = pos.top + pos.height;
    const alpha = draw_get_alpha();

    if (this.shadow > 0) {
      draw_set_alpha(this.shadowAlpha * this.alpha);
      draw_roundrect_color_ext(
        x1 + this.shadow,
        y1 + this.shadow,
        x2 + this.shadow,
        y2 + this.shadow,
        this.rad,
        this.rad,
        this.shadowColor,
        this.shadowColor,
        false,
      );
    }

    draw_set_alpha(this.alpha);
    const bottom = this.color2 ?? this.color;
    draw_roundrect_color_ext(
      x1,
      y1,
      x2,
      y2,
      this.rad,
      this.rad,
      this.color,
      bottom,
      false,
    );

    // draw_roundrect outlines are 1px; loop to fake thickness.
    for (let i = 0; i < this.border; i++) {
      draw_roundrect_color_ext(
        x1 + i,
        y1 + i,
        x2 - i,
        y2 - i,
        this.rad,
        this.rad,
        this.borderColor,
        this.borderColor,
        true,
      );
    }

    draw_set_alpha(alpha);
  }
};
