/**
 * @implements {UIComponent}
 * Drag handle for a movable window. Lives on a title-bar element; `target` is the
 * window-root element to move (defaults to the element this is attached to). On a
 * left-press over the title bar it latches and, while held, accumulates the pointer
 * delta into `target.dragX/dragY` — which UIElement.getLayoutPosition adds to the
 * window and its whole subtree (draw + hit-test), so the window moves bodily. This is
 * the offset-not-mutation pattern (mirrors UIScroll's thumb drag) — the kit drives live
 * layout with draw-time offsets, not flexpanel style mutation.
 *
 * Returns block=true while hovering or dragging so the grab doesn't leak to widgets
 * behind. Mouse-only — it doesn't touch UINav (the window's child widgets stay
 * keyboard/gamepad navigable on their own).
 *
 * Pointer state comes from UIPointer (the frame-latched edges), not a direct
 * mouse_check_button* read (realtime-sampled on GMRT — see CLAUDE.md).
 */
globalThis.UIDrag = class UIDrag {
  /** @param {Object} [opts] { target: UIElement } the window root to move (defaults to the host element) */
  constructor(opts = {}) {
    this.target = opts.target ?? null; // window root to move; falls back to element
    this._dragging = false;
    this._lastX = 0; // last pointer pos, for per-frame delta accumulation
    this._lastY = 0;
  }

  /** @param {UIElement} element @param {boolean} block @returns {boolean} whether the pointer is captured */
  onUpdate(element, block) {
    const target = this.target ?? element;
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return block; // unlaid-out (NaN) or zero-width

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    const over = !block && element.positionMeeting(mx, my);

    if (!this._dragging) {
      if (over && UIPointer.pressed) {
        this._dragging = true;
        this._lastX = mx;
        this._lastY = my;
      }
    } else if (UIPointer.down) {
      target.dragX += mx - this._lastX;
      target.dragY += my - this._lastY;
      this._lastX = mx;
      this._lastY = my;
    } else {
      this._dragging = false;
    }

    return this._dragging || over || block;
  }
};
