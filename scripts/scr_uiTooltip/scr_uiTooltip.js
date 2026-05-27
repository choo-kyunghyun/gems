/** @implements {UIComponent} */
globalThis.UITooltip = class UITooltip {
  constructor(tooltip = {}) {
    this.textRef = tooltip.textRef ?? (() => "");
    this.delay = tooltip.delay ?? 0.2;
    this.elapsed = 0;
  }

  onUpdate(element) {
    const trigger = element.getComponent(UITrigger);
    if (trigger && trigger.enter) {
      this.elapsed += Time.raw;
      if (this.elapsed >= this.delay) {
        const str = this.textRef();
        if (str !== "") Tooltip.set(str);
      }
    } else {
      this.elapsed = 0;
    }
  }
};
