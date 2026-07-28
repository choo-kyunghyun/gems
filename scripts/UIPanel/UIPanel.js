// Rounded-rect background (base visual under most widgets) — radial fill + optional shadow/border/
// bevel, faked with stacked draw_roundrect passes. Colors are live fields so UIButton can swap per frame.
/**
 * @typedef {Object} UIPanelOpts
 * @property {number} [color] fill color
 * @property {number} [color2] edge tint (center→edge radial)
 * @property {number} [alpha]
 * @property {number} [rad] corner radius
 * @property {number} [border] outline thickness px
 * @property {number} [borderColor]
 * @property {number} [shadow] blur spread px
 * @property {number} [shadowColor]
 * @property {number} [shadowAlpha]
 * @property {number} [highlight] top-bevel strip thickness px
 * @property {number} [highlightColor]
 * @property {number} [highlightAlpha]
 * @implements {UIComponent}
 */
globalThis.UIPanel = class UIPanel {
  /** @param {UIPanelOpts} [panel] */
  constructor(panel = {}) {
    this.color = panel.color ?? c_white;
    // edge color: draw_roundrect's two colors run center→edge (radial), reading as a rim/vignette.
    // unset → solid fill from live `color` (keeps UIButton's per-frame swap working).
    this.color2 = panel.color2;
    this.alpha = panel.alpha ?? 1;
    this.rad = panel.rad ?? 0;
    this.border = panel.border ?? 0; // outline thickness px; 0 = none
    this.borderColor = panel.borderColor ?? c_white;
    // soft drop shadow: blur spread px (0 = none); faked with expanding fading roundrects.
    this.shadow = panel.shadow ?? 0;
    this.shadowColor = panel.shadowColor ?? c_black;
    this.shadowAlpha = panel.shadowAlpha ?? 0.35;
    // inner top bevel: a thin light strip faking a light-from-above sheen; strip thickness px.
    this.highlight = panel.highlight ?? 0;
    this.highlightColor = panel.highlightColor ?? c_white;
    this.highlightAlpha = panel.highlightAlpha ?? 0.06;
  }

  /** @param {UIElement} element */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    const x1 = pos.left;
    const y1 = pos.top;
    const x2 = pos.left + pos.width;
    const y2 = pos.top + pos.height;
    const alpha = draw_get_alpha();

    // stack translucent roundrects, each grown + nudged down, so overlap is densest at the edge.
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

    // inner top bevel — a horizontal sheen strip between the rounded corners.
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

    draw_set_alpha(this.alpha);
    drawUIOutline(x1, y1, x2, y2, this.rad, this.borderColor, this.border);

    draw_set_alpha(alpha);
  }
};
