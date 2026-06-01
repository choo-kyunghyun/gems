/**
 * @implements {UIComponent}
 * TODO: Broken
 */
globalThis.UIButton = class UIButton {
  constructor(btn = {}) {
    this.colorNormal = btn.colorNormal ?? c_white;
    this.colorHover = btn.colorHover ?? c_ltgray;
    this.colorPress = btn.colorPress ?? c_gray;
    this.colorDisabled = btn.colorDisabled ?? c_dkgray;
    this.alpha = btn.alpha ?? 1;
    this.alphaDisabled = btn.alphaDisabled ?? 0.5;
    this.disabled = btn.disabled ?? false;
  }

  onUpdate(element, block) {
    const panel = element.getComponent(UIPanel);
    const trigger = element.getComponent(UITrigger);
    if (!panel || !trigger) return block;

    if (this.disabled) {
      panel.color = this.colorDisabled;
      panel.alpha = this.alphaDisabled;
      return block;
    }

    panel.alpha = this.alpha;
    if (trigger.hold) {
      panel.color = this.colorPress;
    } else if (trigger.enter) {
      panel.color = this.colorHover;
    } else {
      panel.color = this.colorNormal;
    }

    return block;
  }

  onDestroy(element) {}

  onDraw(element) {}
};
