/**
 * @implements {UIComponent}
 * Drag handle for a movable window. While held, accumulates the pointer delta into
 * `target.dragX/dragY`, which getLayoutPosition adds to the window + subtree — the
 * offset-not-mutation pattern (kit drives live layout with draw-time offsets, not
 * flexpanel style mutation). Mouse-only — doesn't touch UINav.
 * Pointer edges from UIPointer (frame-latched), not mouse_check_button* (realtime on GMRT).
 */
globalThis.UIDrag = class UIDrag {
  /** @param {Object} [opts] { target: UIElement } the window root to move (defaults to the host element) */
  constructor(opts = {}) {
    this.target = opts.target ?? null; // window root; falls back to host element
    this._dragging = false;
    this._lastX = 0; // last pointer pos, for per-frame delta
    this._lastY = 0;
  }

  /**
   * @param {UIElement} element
   * @param {boolean} block
   * @returns {boolean} whether the pointer is captured
   */
  onUpdate(element, block) {
    const target = this.target ?? element;
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
