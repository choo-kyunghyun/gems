/**
 * @implements {UIComponent}
 * Resize grip for a sizable window — the companion to UIDrag. Lives on a small grip
 * element pinned to a window's bottom-right corner; `target` is the window-root element
 * to resize (defaults to the host). On a left-press over the grip it latches and captures
 * the target's CURRENT laid-out size (so a window needn't pre-declare an explicit size —
 * it can start content-sized and become fixed-size only once resized), then while held
 * sets target width/height to that base plus the pointer delta, clamped to [min, gui].
 *
 * Unlike UIDrag (a pure draw-time offset), resizing genuinely changes layout, so it uses
 * flexpanel style mutation (UIElement.setWidth/setHeight → markDirty → recalculated next
 * refresh) — the same reliable-on-0.20 path UIText/UIRichText self-size with. For the
 * window's content to FILL the new size its card/body flex-grow (see gemsWindow); content
 * that doesn't grow simply leaves slack (the min keeps it from clipping on shrink).
 *
 * `anchorCenterX`: the target is horizontally CENTERED by its parent (gemsWindow's host
 * uses alignItems:center), so simply growing its width spreads it symmetrically about the
 * centre — the left edge drifts out and the grip tracks the cursor at only half speed
 * ("feels like holding shift"). When set, the component offsets the target's dragX by half
 * the width change so the LEFT edge stays put and the right edge follows the cursor 1:1,
 * i.e. a normal top-left resize anchor. (The vertical axis is already top-anchored by the
 * host, so the bottom edge tracks the cursor without compensation — hence X only.)
 *
 * Returns block=true while hovering or dragging so the grip doesn't leak to widgets behind.
 * Mouse-only — it doesn't touch UINav. Pointer edges come from UIPointer (frame-latched),
 * never a direct mouse_check_button* read (realtime-sampled on GMRT — see CLAUDE.md).
 */
globalThis.UIResize = class UIResize {
  /** @param {Object} [opts] { target, minWidth, minHeight, color, anchorCenterX } */
  constructor(opts = {}) {
    this.target = opts.target ?? null; // window root to resize; falls back to host element
    this.minWidth = opts.minWidth ?? 240;
    this.minHeight = opts.minHeight ?? 160;
    this.color = opts.color ?? c_gray;
    this.anchorCenterX = opts.anchorCenterX ?? false; // compensate a center-aligned parent

    this._dragging = false;
    this._startX = 0; // pointer pos at grab
    this._startY = 0;
    this._baseW = 0; // target layout size at grab (deltas accumulate from here)
    this._baseH = 0;
    this._baseDragX = 0; // target.dragX at grab (anchorCenterX compensation is relative to it)
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
      // Clamp to [min, GUI extent] so the window can't shrink into a broken layout or grow
      // off-screen. The GUI layer is the design resolution (display_get_gui_*).
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
      // A center-aligned parent would split the width growth either side of centre; shift the
      // window right by half the growth so the left edge stays anchored (grip tracks 1:1).
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
    // Three nested diagonal ticks — the conventional resize-grip look.
    for (let i = 0; i < 3; i++) {
      const o = 4 + i * 4;
      draw_line_color(x2 - o, y2, x2, y2 - o, this.color, this.color);
    }
    draw_set_alpha(a0);
  }
};
