/** @implements {UIComponent} */
globalThis.UIPanel = class UIPanel {
  constructor(panel = {}) {
    this.color = panel.color ?? c_white;
    // Optional edge color. draw_roundrect's two colors run center→edge (radial,
    // not top→bottom), so this reads as a subtle vignette/rim. Unset → solid fill
    // from the live `color` (so UIButton's per-frame color swap still works).
    this.color2 = panel.color2;
    this.alpha = panel.alpha ?? 1;
    this.rad = panel.rad ?? 0;
    // Outline drawn on top of the fill (thickness in px; 0 = none).
    this.border = panel.border ?? 0;
    this.borderColor = panel.borderColor ?? c_white;
    // Soft drop shadow: `shadow` is the blur spread in px (0 = none). Faked with a
    // few expanding, fading roundrects so it reads as a soft penumbra, not a hard
    // offset copy.
    this.shadow = panel.shadow ?? 0;
    this.shadowColor = panel.shadowColor ?? c_black;
    this.shadowAlpha = panel.shadowAlpha ?? 0.35;
    // Inner top bevel: a thin light strip just inside the top edge that fakes a
    // light-from-above sheen (`highlight` = strip thickness in px; 0 = none).
    this.highlight = panel.highlight ?? 0;
    this.highlightColor = panel.highlightColor ?? c_white;
    this.highlightAlpha = panel.highlightAlpha ?? 0.06;
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();
    const x1 = pos.left;
    const y1 = pos.top;
    const x2 = pos.left + pos.width;
    const y2 = pos.top + pos.height;
    const alpha = draw_get_alpha();

    // Soft shadow — stack translucent roundrects, each expanding outward and
    // nudged down, so the overlap is densest at the panel edge and feathers out.
    if (this.shadow > 0) {
      const layers = 4;
      const drop = this.shadow * 0.35;
      for (let i = 1; i <= layers; i++) {
        const grow = (this.shadow * i) / layers;
        draw_set_alpha((this.shadowAlpha * this.alpha) / layers);
        draw_roundrect_color_ext(
          x1 - grow,
          y1 - grow + drop,
          x2 + grow,
          y2 + grow + drop,
          this.rad + grow,
          this.rad + grow,
          this.shadowColor,
          this.shadowColor,
          false,
        );
      }
    }

    draw_set_alpha(this.alpha);
    const edge = this.color2 ?? this.color;
    draw_roundrect_color_ext(
      x1,
      y1,
      x2,
      y2,
      this.rad,
      this.rad,
      this.color,
      edge,
      false,
    );

    // Inner top bevel — a horizontal sheen strip between the rounded corners.
    if (this.highlight > 0) {
      draw_set_alpha(this.highlightAlpha * this.alpha);
      draw_rectangle_color(
        x1 + this.rad,
        y1 + 1,
        x2 - this.rad,
        y1 + 1 + this.highlight,
        this.highlightColor,
        this.highlightColor,
        this.highlightColor,
        this.highlightColor,
        false,
      );
    }

    // draw_roundrect outlines are 1px; loop to fake thickness.
    draw_set_alpha(this.alpha);
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
