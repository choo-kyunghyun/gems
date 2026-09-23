/**
 * Hover tooltip; must be the element's first component.
 * @implements {UIComponent}
 */
globalThis.UITooltip = class UITooltip {
  /** tooltip: { label: string | () => string, delay: seconds } */
  constructor(tooltip = {}) {
    // string or () => string (I18n.textRef-friendly), resolved live.
    this.label = uiTextRef(tooltip.label ?? "");
    this.delay = tooltip.delay ?? 0.4;
    this._elapsed = 0;
  }

  onUpdate(element, block) {
    const mx = Input.pointer.x;
    const my = Input.pointer.y;
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
