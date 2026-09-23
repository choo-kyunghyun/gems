/**
 * Mirrors hover/held/clicked into `element.state` ({UIState}) so sibling components can react
 * without knowing who computed it. Standalone, a bare trigger is a click swallower; as a
 * delegate, it is the one click FSM every clickable widget runs.
 *
 * `readOnly` is for a widget that shows its state but must not act on a press: hover still
 * fires and still captures, so it swallows clicks meant for what lies under it, but a press never
 * latches `hold`: no onDown/onUp/onClick, and no capture that survives dragging off.
 * @implements {UIComponent}
 */
globalThis.UITrigger = class UITrigger {
  /** trigger: { block, readOnly, onEnter, onHover, onLeave, onDown, onUp, onClick } */
  constructor(trigger = {}) {
    this.block = trigger.block ?? true;
    this.readOnly = trigger.readOnly ?? false;
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
    element.state.clicked = false;
    const mx = Input.pointer.x;
    const my = Input.pointer.y;
    const enterPrev = this.enter;
    this.enter = !block && element.positionMeeting(mx, my);

    if (this.enter) {
      if (!enterPrev) this.onEnter();
      this.onHover();
      if (Input.pointer.left.pressed && !this.readOnly) {
        this.hold = true;
        this.onDown();
      }
    } else if (enterPrev) {
      this.onLeave();
    }

    if (Input.pointer.left.released) {
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
    if (this.readOnly) return this.enter || block;
    return (this.block && (this.hold || this.enter)) || block;
  }

  /** Force-release: fires onUp/onLeave for any latched state, so none is stranded. */
  release() {
    if (this.hold) this.onUp();
    if (this.enter) this.onLeave();
    this.hold = false;
    this.enter = false;
  }

  onDestroy(element) {
    this.release();
  }
};
