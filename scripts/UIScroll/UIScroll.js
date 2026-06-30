/**
 * @implements {UIComponent}
 * Vertical scroll controller for a clip viewport. Drives scrolling by draw-time offset
 * (sets viewport scrollY, which getLayoutPosition subtracts for the subtree) — never flex
 * mutation. Scrollbar sits in a right gutter reserved via clipInsetRight (outside the
 * clipped content); gutter collapses to 0 when nothing overflows. Wheel + drag-thumb input.
 * GMRT: pointer read live each frame (no cached primitive to clobber).
 */
globalThis.UIScroll = class UIScroll {
  /** @param {Object} [scroll] { content: UIElement, barW, barPad, minThumb, wheelStep, trackColor, trackAlpha, thumbColor, thumbHover } */
  constructor(scroll = {}) {
    this.content = scroll.content; // body element to measure + scroll
    this.scroll = 0; // scrollY in px
    this.barW = scroll.barW ?? 8;
    this.barPad = scroll.barPad ?? 4;
    this.minThumb = scroll.minThumb ?? 24;
    this.wheelStep = scroll.wheelStep ?? 48;

    this.trackColor = scroll.trackColor ?? c_black;
    this.trackAlpha = scroll.trackAlpha ?? 0.25;
    this.thumbColor = scroll.thumbColor ?? c_gray;
    this.thumbHover = scroll.thumbHover ?? c_ltgray;

    this._dragging = false;
    this._dragDY = 0; // grab offset inside the thumb
    this._overThumb = false;
    this._track = null; // geometry cached in onUpdate for onDraw (same frame)
  }

  // shared track/thumb geometry so hit-test + draw match.
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

    // reserve the gutter only when scrollable, so a short list uses full width.
    element.clipInsetRight = m.max > 0 ? this.barW + this.barPad * 2 : 0;

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);

    if (m.max > 0) {
      // positionMeeting read live each use, never cached in a local — a cached bool
      // clobbers mid-function on GMRT (that bug gated the wheel to fire only over the thumb).
      const wheel = UIPointer.wheel;
      if (wheel !== 0 && element.positionMeeting(mx, my))
        this.scroll += wheel * this.wheelStep;

      this._overThumb =
        !this._dragging &&
        element.positionMeeting(mx, my) &&
        mx >= m.x1 &&
        mx <= m.x1 + this.barW &&
        my >= m.thumbY &&
        my <= m.thumbY + m.thumbH;
      if (this._overThumb && UIPointer.pressed) {
        this._dragging = true;
        this._dragDY = my - m.thumbY;
      }
    } else {
      this._overThumb = false;
    }

    if (this._dragging) {
      if (UIPointer.down) {
        const travel = m.h - m.thumbH;
        const t = travel > 0 ? (my - this._dragDY - m.y1) / travel : 0;
        this.scroll = clamp(t, 0, 1) * m.max;
      } else {
        this._dragging = false;
      }
    }

    this.scroll = clamp(this.scroll, 0, m.max);
    element.scrollY = this.scroll; // offsets subtree via getLayoutPosition
    this._track = m;

    // capture the pointer over the viewport (or dragging) so wheel/drag don't leak behind.
    return this._dragging || element.positionMeeting(mx, my) || block;
  }

  /** @param {UIElement} element */
  onDraw(element) {
    const m = this._track;
    if (m === null || m.max <= 0) return; // nothing overflowing → no scrollbar

    const a0 = draw_get_alpha();
    const rad = this.barW * 0.5;

    // track.
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

    // thumb.
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
