/** @implements {UIComponent} */
globalThis.UIButton = class UIButton {
  constructor(btn = {}) {
    this.colorNormal = btn.colorNormal ?? c_white;
    this.colorHover = btn.colorHover ?? c_ltgray;
    this.colorPress = btn.colorPress ?? c_gray;
    this.colorDisabled = btn.colorDisabled ?? c_dkgray;
    this.alpha = btn.alpha ?? 1;
    this.alphaDisabled = btn.alphaDisabled ?? 0.5;
    this.disabled = btn.disabled ?? false;
    this.onEnter = btn.onEnter ?? noop;
    this.onLeave = btn.onLeave ?? noop;
    this.onDown = btn.onDown ?? noop;
    this.onUp = btn.onUp ?? noop;
    this.onClick = btn.onClick ?? noop;
    this.enter = false;
    this.hold = false;
  }

  onUpdate(element, block) {
    const panel = element.getComponent(UIPanel);

    if (this.disabled) {
      if (this.hold) {
        this.onUp();
        this.hold = false;
      }
      if (this.enter) {
        this.onLeave();
        this.enter = false;
      }
      if (panel) {
        panel.color = this.colorDisabled;
        panel.alpha = this.alphaDisabled;
      }
      return block;
    }

    const pressed = mouse_check_button_pressed(mb_left);
    const released = mouse_check_button_released(mb_left);
    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    const enterPrev = this.enter;
    this.enter = !block && element.positionMeeting(mx, my);

    if (this.enter) {
      if (!enterPrev) this.onEnter();
      if (pressed) {
        this.hold = true;
        this.onDown();
      }
    } else if (enterPrev) {
      this.onLeave();
    }

    if (released) {
      if (this.hold) {
        this.onUp();
        if (this.enter) this.onClick();
      }
      this.hold = false;
    }

    if (panel) {
      panel.alpha = this.alpha;
      panel.color = this.hold
        ? this.colorPress
        : this.enter
          ? this.colorHover
          : this.colorNormal;
    }

    return (this.hold || this.enter) || block;
  }

  onDestroy(element) {
    if (this.hold) this.onUp();
    if (this.enter) this.onLeave();
  }
};
