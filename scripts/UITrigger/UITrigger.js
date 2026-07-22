// THE canonical pointer FSM (hover/press/release-inside-commit) — fires callbacks and mirrors its
// state into the host's `element.state` blackboard. Contract on the class below.
/**
 * Mirrors hover/held/clicked into `element.state` (see the UIState typedef in UIElement) so sibling
 * components can react without knowing who computed it. Used two ways: standalone as a component (a
 * bare `new UITrigger({})` is a click swallower), and as the internal delegate every clickable widget
 * (UIButton/UICheckbox/UISelect/…) runs instead of cloning this logic. UIButton is the themed variant
 * (adds easing + disabled/selected).
 * @implements {UIComponent}
 */
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
    element.state.clicked = false;
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
        if (this.enter) {
          element.state.clicked = true;
          this.onClick();
        }
      }
      this.hold = false;
    }

    element.state.hover = this.enter;
    element.state.held = this.hold;
    return (this.block && (this.hold || this.enter)) || block;
  }

  /** force-release: fire onUp/onLeave for any latched state, then clear it — used by
   *  teardown and by a delegating widget entering its disabled state. */
  release() {
    if (this.hold) this.onUp();
    if (this.enter) this.onLeave();
    this.hold = false;
    this.enter = false;
  }

  /** fire onUp/onLeave on teardown so held/hovered state isn't stranded. @param {UIElement} element */
  onDestroy(element) {
    this.release();
  }
};
