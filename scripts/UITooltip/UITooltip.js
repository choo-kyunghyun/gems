// Hover-to-show tooltip — feeds the global Tooltip renderer once dwell passes `delay`. Add it as the
// FIRST component (facetTooltip does, index 0) so a sibling's `block` doesn't suppress its own tooltip.
/** @implements {UIComponent} */
globalThis.UITooltip = class UITooltip {
  /** tooltip: { label: string | () => string, delay: seconds } */
  constructor(tooltip = {}) {
    // string or () => string (I18n.textRef-friendly), resolved live.
    this.label = uiTextRef(tooltip.label ?? "");
    this.delay = tooltip.delay ?? 0.4;
    this._elapsed = 0;
  }

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
