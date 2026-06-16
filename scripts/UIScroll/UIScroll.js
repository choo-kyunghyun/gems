/**
 * @implements {UIComponent}
 * Vertical scroll controller for a clip container. Lives on the viewport element
 * (clip = true, fixed height); its `content` child is a flexShrink-0 column that
 * keeps its natural, taller height and overflows. The component drives scrolling
 * with draw-time offset (it sets the viewport's scrollY, which getLayoutPosition
 * subtracts for the whole subtree) — never flex mutation — and the viewport clips
 * the overflow to a surface (UIElement._drawClipped). Wheel + drag-thumb input.
 *
 * The scrollbar is drawn in a right gutter that the component reserves on the
 * viewport via clipInsetRight, so it sits outside the clipped content area (the
 * content surface never covers it). Gutter collapses to 0 when nothing overflows.
 *
 * GMRT note: timers/easing would use Time.raw, but this control has none — it reads
 * live pointer state each frame, so there is no cached primitive to be clobbered.
 */
globalThis.UIScroll = class UIScroll {
  /** @param {Object} [scroll] { content: UIElement, barW, barPad, minThumb, wheelStep, trackColor, trackAlpha, thumbColor, thumbHover } */
  constructor(scroll = {}) {
    this.content = scroll.content; // the body element to measure + scroll
    this.scroll = 0; // current scrollY in px
    this.barW = scroll.barW ?? 8;
    this.barPad = scroll.barPad ?? 4;
    this.minThumb = scroll.minThumb ?? 24;
    this.wheelStep = scroll.wheelStep ?? 48;

    this.trackColor = scroll.trackColor ?? c_black;
    this.trackAlpha = scroll.trackAlpha ?? 0.25;
    this.thumbColor = scroll.thumbColor ?? c_gray;
    this.thumbHover = scroll.thumbHover ?? c_ltgray;

    this._dragging = false;
    this._dragDY = 0; // grab offset inside the thumb while dragging
    this._overThumb = false;
    this._track = null; // geometry cached each onUpdate for onDraw (same frame)
  }

  // Shared track/thumb geometry so hit-testing and drawing match exactly.
  _metrics(pos, contentH) {
    const barW = this.barW;
    const x1 = pos.left + pos.width - barW - this.barPad;
    const y1 = pos.top + this.barPad;
    const h = Math.max(1, pos.height - this.barPad * 2);
    const ratio = contentH > 0 ? pos.height / contentH : 1;
    const thumbH = clamp(ratio * h, this.minThumb, h);
    const max = Math.max(0, contentH - pos.height);
    const t = max > 0 ? this.scroll / max : 0;
    const thumbY = y1 + t * (h - thumbH);
    return { x1, y1, h, thumbH, thumbY, max };
  }

  /** @param {UIElement} element the clip viewport @param {boolean} block @returns {boolean} whether the pointer is captured */
  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return block; // unlaid-out (NaN) or zero-width

    const contentH = this.content ? this.content.getLayoutPosition().height : 0;
    const m = this._metrics(pos, contentH);

    // Reserve the scrollbar gutter only when there is something to scroll, so a
    // short list uses the full width.
    element.clipInsetRight = m.max > 0 ? this.barW + this.barPad * 2 : 0;

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);

    if (m.max > 0) {
      // positionMeeting is read live at each use, never cached in a boolean local —
      // a cached primitive bool can be clobbered mid-function on GMRT (that bug was
      // gating the wheel so it only fired over the thumb).
      const wheel = (mouse_wheel_down() ? 1 : 0) - (mouse_wheel_up() ? 1 : 0);
      if (wheel !== 0 && element.positionMeeting(mx, my))
        this.scroll += wheel * this.wheelStep;

      this._overThumb =
        !this._dragging &&
        element.positionMeeting(mx, my) &&
        mx >= m.x1 &&
        mx <= m.x1 + this.barW &&
        my >= m.thumbY &&
        my <= m.thumbY + m.thumbH;
      if (this._overThumb && mouse_check_button_pressed(mb_left)) {
        this._dragging = true;
        this._dragDY = my - m.thumbY;
      }
    } else {
      this._overThumb = false;
    }

    if (this._dragging) {
      if (mouse_check_button(mb_left)) {
        const travel = m.h - m.thumbH;
        const t = travel > 0 ? (my - this._dragDY - m.y1) / travel : 0;
        this.scroll = clamp(t, 0, 1) * m.max;
      } else {
        this._dragging = false;
      }
    }

    this.scroll = clamp(this.scroll, 0, m.max);
    element.scrollY = this.scroll; // offsets the subtree via getLayoutPosition
    this._track = m;

    // Capture the pointer while it's over the viewport (or dragging) so the scroll
    // area owns the wheel and the thumb drag rather than leaking to siblings behind.
    return this._dragging || element.positionMeeting(mx, my) || block;
  }

  /** @param {UIElement} element */
  onDraw(element) {
    const m = this._track;
    if (m === null || m.max <= 0) return; // nothing overflowing → no scrollbar

    const a0 = draw_get_alpha();
    const rad = this.barW * 0.5;

    // Track.
    draw_set_alpha(this.trackAlpha);
    draw_roundrect_color_ext(
      m.x1,
      m.y1,
      m.x1 + this.barW,
      m.y1 + m.h,
      rad,
      rad,
      this.trackColor,
      this.trackColor,
      false,
    );

    // Thumb.
    draw_set_alpha(1);
    const col =
      this._overThumb || this._dragging ? this.thumbHover : this.thumbColor;
    draw_roundrect_color_ext(
      m.x1,
      m.thumbY,
      m.x1 + this.barW,
      m.thumbY + m.thumbH,
      rad,
      rad,
      col,
      col,
      false,
    );

    draw_set_alpha(a0);
  }
};
