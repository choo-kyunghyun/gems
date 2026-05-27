/** @implements {UIComponent} */
globalThis.UITrigger = class UITrigger {
  constructor(trigger = {}) {
    this.block = trigger.block ?? true;
    this.onEnter = trigger.onEnter ?? noop;
    this.onHover = trigger.onHover ?? noop;
    this.onLeave = trigger.onLeave ?? noop;
    this.onDown = trigger.onDown ?? noop;
    this.onUp = trigger.onUp ?? noop;
    this.onClick = trigger.onClick ?? noop;
    this.enter = false;
    this.hold = false;
  }

  onUpdate(element, block) {
    const pressed = mouse_check_button_pressed(mb_left);
    const released = mouse_check_button_released(mb_left);
    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    const enterPrev = this.enter;
    this.enter = element.positionMeeting(mx, my);

    if (this.enter) {
      if (!enterPrev) this.onEnter();
      this.onHover();
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
        if (this.enter && !block) this.onClick();
      }
      this.hold = false;
    }

    return (this.block && (this.hold || this.enter)) || block;
  }

  onDestroy(element) {
    if (this.hold) this.onUp();
    if (this.enter) this.onLeave();
  }

  onDraw(element) {}
};
