// Bare pointer-interaction component: a hover/press state machine firing
// onEnter/Hover/Leave/Down/Up/Click, with no visuals. UIButton is the richer variant (same FSM
// shape + color animation + disabled/selected); use UITrigger when you only need the callbacks.
/** @implements {UIComponent} */
globalThis.UITrigger = class UITrigger {
  /** @param {Object} [trigger] { block, onEnter, onHover, onLeave, onDown, onUp, onClick } */
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

  /** @param {UIElement} element @param {boolean} block @returns {boolean} whether the pointer is captured */
  onUpdate(element, block) {
    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    const enterPrev = this.enter;
    this.enter = !block && element.positionMeeting(mx, my);

    if (this.enter) {
      if (!enterPrev) this.onEnter();
      this.onHover();
      if (UIPointer.pressed) {
        this.hold = true;
        this.onDown();
      }
    } else if (enterPrev) {
      this.onLeave();
    }

    if (UIPointer.released) {
      if (this.hold) {
        this.onUp();
        if (this.enter) this.onClick();
      }
      this.hold = false;
    }

    return (this.block && (this.hold || this.enter)) || block;
  }

  /** Release any held/hovered state on teardown so onUp/onLeave still fire. @param {UIElement} element */
  onDestroy(element) {
    if (this.hold) this.onUp();
    if (this.enter) this.onLeave();
  }
};
