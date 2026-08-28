// Rounded-rect background (base visual under most widgets) — a flat fill + optional 1px border.
// Colors/alpha are live fields so UIButton/UIModal can swap them per frame.
/**
 * @typedef {Object} UIPanelOpts
 * @property {number} [color] fill color
 * @property {number} [alpha]
 * @property {number} [rad] corner radius
 * @property {number} [border] outline thickness px
 * @property {number} [borderColor]
 * @implements {UIComponent}
 */
globalThis.UIPanel = class UIPanel {
  constructor(panel = {}) {
    this.color = panel.color ?? c_white;
    this.alpha = panel.alpha ?? 1;
    this.rad = panel.rad ?? 0;
    this.border = panel.border ?? 0; // outline thickness px; 0 = none
    this.borderColor = panel.borderColor ?? c_white;
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();
    const x1 = pos.left;
    const y1 = pos.top;
    const x2 = pos.left + pos.width;
    const y2 = pos.top + pos.height;
    const alpha = draw_get_alpha();

    draw_set_alpha(this.alpha);
    draw_roundrect_color_ext(
      x1,
      y1,
      x2,
      y2,
      this.rad,
      this.rad,
      this.color,
      this.color,
      false,
    );
    drawUIOutline(x1, y1, x2, y2, this.rad, this.borderColor, this.border);

    draw_set_alpha(alpha);
  }
};
