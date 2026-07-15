/**
 * @implements {UIComponent}
 * Resize grip for a sizable window — companion to UIDrag, on a bottom-right corner grip.
 * On grab captures the target's CURRENT laid-out size (so a window can start content-sized
 * and fix only once resized), then sets width/height to base + pointer delta, clamped to
 * [min, gui]. Unlike UIDrag this genuinely changes layout, so it uses flexpanel style
 * mutation (setWidth/setHeight → markDirty → recalc) — the reliable-on-0.20 path UIText
 * self-sizes with. Content fills via flex-grow (gemsWindow); the min stops clip on shrink.
 *
 * `anchorCenterX`: gemsWindow's host centers the target, so growing width spreads it about
 * the centre — grip tracks the cursor at half speed. When set, shifts dragX by half the
 * width change so the LEFT edge stays put and the right edge tracks 1:1 (X only — the
 * vertical axis is already top-anchored).
 *
 * Mouse-only — doesn't touch UINav. Pointer edges from UIPointer (frame-latched), not
 * mouse_check_button* (the poll-once rule — see docs/architecture/ui.md).
 */
globalThis.UIResize = class UIResize {
  /** @param {Object} [opts] { target, minWidth, minHeight, color, anchorCenterX } */
  constructor(opts = {}) {
    this.target = opts.target ?? null; // window root; falls back to host element
    this.minWidth = opts.minWidth ?? 240;
    this.minHeight = opts.minHeight ?? 160;
    this.color = opts.color ?? c_gray;
    this.anchorCenterX = opts.anchorCenterX ?? false; // compensate a center-aligned parent

    this._dragging = false;
    this._startX = 0; // pointer pos at grab
    this._startY = 0;
    this._baseW = 0; // target layout size at grab (deltas accumulate from here)
    this._baseH = 0;
    this._baseDragX = 0; // target.dragX at grab (anchorCenterX shift is relative to it)
  }

  /** @param {UIElement} element @param {boolean} block @returns {boolean} whether the pointer is captured */
  onUpdate(element, block) {
    const target = this.target ?? element;
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return block; // unlaid-out (NaN) or zero-size

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    const over = !block && element.positionMeeting(mx, my);

    if (!this._dragging) {
      if (over && UIPointer.pressed) {
        const tp = target.getLayoutPosition();
        this._dragging = true;
        this._startX = mx;
        this._startY = my;
        this._baseW = tp.width;
        this._baseH = tp.height;
        this._baseDragX = target.dragX;
      }
    } else if (UIPointer.down) {
      // clamp to [min, GUI extent] so the window can't break its layout or grow off-screen.
      const w = clamp(
        this._baseW + (mx - this._startX),
        this.minWidth,
        display_get_gui_width(),
      );
      const h = clamp(
        this._baseH + (my - this._startY),
        this.minHeight,
        display_get_gui_height(),
      );
      target.setWidth(w, flexpanel_unit.point);
      target.setHeight(h, flexpanel_unit.point);
      // shift right by half the growth so the left edge stays anchored (grip tracks 1:1).
      if (this.anchorCenterX)
        target.dragX = this._baseDragX + (w - this._baseW) * 0.5;
    } else {
      this._dragging = false;
    }

    return this._dragging || over || block;
  }

  /** @param {UIElement} element draws the corner grip glyph (diagonal hatch). */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return;
    const a0 = draw_get_alpha();
    const x2 = pos.left + pos.width - 3;
    const y2 = pos.top + pos.height - 3;
    draw_set_alpha(this._dragging ? 1 : 0.6);
    // three nested diagonal ticks — conventional grip look.
    for (let i = 0; i < 3; i++) {
      const o = 4 + i * 4;
      draw_line_color(x2 - o, y2, x2, y2 - o, this.color, this.color);
    }
    draw_set_alpha(a0);
  }
};
