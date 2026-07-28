// Shared vertical scrollbar model — the track/thumb geometry, drag latch, and two-roundrect draw used
// by UIScroll (pixel) and UITable (rows). NOT a UIComponent. Contract on the class below.
/**
 * The host widget owns when it runs; this owns only the bar. The host maps the normalized t ∈ [0,1]
 * returned by input() onto its own scroll unit (px or rows).
 */
globalThis.UIScrollbar = class UIScrollbar {
  /** @param {Object} [s] { barW, minThumb, trackColor, trackAlpha, thumbColor, thumbHover } */
  constructor(s = {}) {
    this.barW = s.barW ?? 8;
    this.minThumb = s.minThumb ?? 24;
    this.trackColor = s.trackColor ?? c_black;
    this.trackAlpha = s.trackAlpha ?? 0.25;
    this.thumbColor = s.thumbColor ?? c_gray;
    this.thumbHover = s.thumbHover ?? c_ltgray;
    this.dragging = false;
    this.over = false; // pointer over the thumb (hover tint)
    this._dragDY = 0; // grab offset inside the thumb
  }

  /**
   * track/thumb geometry for a bar at (x, y, h) showing `view` of `total` units with the
   * current scroll at t ∈ [0,1]. Same shape consumed by input() and draw().
   * @param {number} x
   * @param {number} y
   * @param {number} h track height (px)
   * @param {number} view visible extent
   * @param {number} total content extent (same unit)
   * @param {number} t current scroll position, normalized
   * @returns {{x:number, y:number, h:number, thumbH:number, thumbY:number}}
   */
  metrics(x, y, h, view, total, t) {
    const ratio = total > 0 ? view / total : 1;
    const thumbH = clamp(ratio * h, this.minThumb, h);
    const thumbY = y + t * (h - thumbH);
    return { x, y, h, thumbH, thumbY };
  }

  /**
   * pointer step: thumb hover + press latch + drag tracking. Reads the frame-latched
   * UIPointer edges (poll-once rule). `hoverGate` = extra hit-test condition the host
   * imposes (UIScroll also requires the pointer inside its viewport; pass true otherwise).
   * @param {{x:number, y:number, h:number, thumbH:number, thumbY:number}} m
   * @param {number} mx
   * @param {number} my
   * @param {boolean} hoverGate
   * @returns {number} the dragged position t ∈ [0,1], or -1 when not dragging
   */
  input(m, mx, my, hoverGate) {
    this.over =
      !this.dragging &&
      hoverGate &&
      mx >= m.x &&
      mx <= m.x + this.barW &&
      my >= m.thumbY &&
      my <= m.thumbY + m.thumbH;
    if (this.over && UIPointer.pressed) {
      this.dragging = true;
      this._dragDY = my - m.thumbY;
    }
    if (this.dragging) {
      if (UIPointer.down) {
        const travel = m.h - m.thumbH;
        const t = travel > 0 ? (my - this._dragDY - m.y) / travel : 0;
        return clamp(t, 0, 1);
      }
      this.dragging = false;
    }
    return -1;
  }

  /** track + thumb (hover-tinted). @param {{x:number, y:number, h:number, thumbH:number, thumbY:number}} m */
  draw(m) {
    const a0 = draw_get_alpha();
    const rad = this.barW * 0.5;
    draw_set_alpha(this.trackAlpha);
    draw_roundrect_color_ext(
      m.x,
      m.y,
      m.x + this.barW,
      m.y + m.h,
      rad,
      rad,
      this.trackColor,
      this.trackColor,
      false,
    );
    draw_set_alpha(1);
    const col = this.over || this.dragging ? this.thumbHover : this.thumbColor;
    draw_roundrect_color_ext(
      m.x,
      m.thumbY,
      m.x + this.barW,
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
