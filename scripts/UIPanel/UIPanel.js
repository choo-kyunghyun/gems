/** @implements {UIComponent} */
globalThis.UIPanel = class UIPanel {
  constructor(panel = {}) {
    this.color = panel.color ?? c_white;
    this.alpha = panel.alpha ?? 1;
    this.rad = panel.rad ?? 0;
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();
    const alpha = draw_get_alpha();
    draw_set_alpha(this.alpha);
    draw_roundrect_color_ext(
      pos.left,
      pos.top,
      pos.left + pos.width,
      pos.top + pos.height,
      this.rad,
      this.rad,
      this.color,
      this.color,
      false,
    );
    draw_set_alpha(alpha);
  }

  onDestroy(element) {}

  onUpdate(eleement, block) { return block; }
};
