/**
 * A scrollbar's track/thumb model: the host widget owns when it runs, this owns only the bar. The
 * host maps the normalized t ∈ [0,1] returned by input() onto its own scroll unit (px or rows).
 */
globalThis.UIScrollbar = class UIScrollbar {
  /** s: { barW, minThumb, trackColor, trackAlpha, thumbColor, thumbHover } */
  constructor(s = {}) {
    this.barW = s.barW ?? 8;
    this.minThumb = s.minThumb ?? 24;
    this.trackColor = s.trackColor ?? c_black;
    this.trackAlpha = s.trackAlpha ?? 0.25;
    this.thumbColor = s.thumbColor ?? c_gray;
    this.thumbHover = s.thumbHover ?? c_ltgray;
    this.dragging = false;
    this.over = false; // pointer over the thumb
    this._dragDY = 0; // grab offset inside the thumb
  }

  /** Geometry for a bar showing `view` of `total` units (any shared unit) at scroll t ∈ [0,1]. */
  metrics(x, y, h, view, total, t) {
    const ratio = total > 0 ? view / total : 1;
    const thumbH = clamp(ratio * h, this.minThumb, h);
    const thumbY = y + t * (h - thumbH);
    return { x, y, h, thumbH, thumbY };
  }

  /**
   * `hoverGate` is an extra hit-test condition the host imposes (true for none). Returns the
   * dragged position t ∈ [0,1], or -1 when not dragging.
   */
  input(m, mx, my, hoverGate) {
    this.over =
      !this.dragging &&
      hoverGate &&
      mx >= m.x &&
      mx <= m.x + this.barW &&
      my >= m.thumbY &&
      my <= m.thumbY + m.thumbH;
    if (this.over && Input.pointer.left.pressed) {
      this.dragging = true;
      this._dragDY = my - m.thumbY;
    }
    if (this.dragging) {
      if (Input.pointer.left.down) {
        const travel = m.h - m.thumbH;
        const t = travel > 0 ? (my - this._dragDY - m.y) / travel : 0;
        return clamp(t, 0, 1);
      }
      this.dragging = false;
    }
    return -1;
  }

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
