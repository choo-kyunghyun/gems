/**
 * @implements {UIComponent}
 * Hover-to-show tooltip. Self-contained: it detects its own hover (no separate
 * UITrigger needed) and honors the `block` flag so it stays hidden whenever a
 * higher element captured the pointer. Each frame the pointer dwells past
 * `delay`, it feeds the global `Tooltip` renderer, which draws once in Draw_75.
 *
 * Add it as the FIRST component on its element (the gemsTooltip factory does this
 * via index 0) so a sibling interactive component on the same element — a
 * UIButton setting `block` true while hovered — doesn't suppress the very tooltip
 * meant to describe it. The incoming `block` then reflects only higher roots and
 * children, which is exactly what should hide the tooltip.
 */
globalThis.UITooltip = class UITooltip {
  /** @param {Object} [tooltip] { label: string | () => string, delay: seconds } */
  constructor(tooltip = {}) {
    // Accept a string or a () => string (I18n.textRef-friendly), resolved live.
    const label = tooltip.label ?? "";
    this.label = typeof label === "function" ? label : () => label;
    this.delay = tooltip.delay ?? 0.4;
    this._elapsed = 0;
  }

  /** @param {UIElement} element @param {boolean} block @returns {boolean} */
  onUpdate(element, block) {
    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    const over = !block && element.positionMeeting(mx, my);
    if (!over) {
      this._elapsed = 0;
      return block;
    }
    this._elapsed += Time.raw;
    if (this._elapsed >= this.delay) {
      const str = this.label();
      if (str !== "") Tooltip.set(str);
    }
    return block;
  }
};
