/** @implements {UIComponent} */
globalThis.UISlider = class UISlider {
  constructor(slider = {}) {
    this.min = slider.min ?? 0;
    this.max = slider.max ?? 1;
    this.value = slider.value ?? this.min;
    this.step = slider.step;
    this.values = slider.values;
    this.readOnly = slider.readOnly ?? false;
    this.onChange = slider.onChange ?? noop;

    // Style structs: { color, rad?, border?, borderColor?, shadowAlpha? }. The
    // track/fill/thumb are drawn directly in onDraw (no child UIElements) — the
    // per-frame flexpanel style setters that an absolute-child layout would need
    // are unreliable (bug #15065), which left the fill/thumb invisible.
    this._trackStyle = slider.track ?? {};
    this._fillStyle = slider.fill ?? {};
    this._thumbStyle = slider.thumb ?? {};

    this._over = false;
    this._hold = false;
  }

  _snap(value) {
    if (Array.isArray(this.values) && this.values.length > 0) {
      let best = 0;
      let bestD = Math.abs(this.values[0] - value);
      for (let i = 1; i < this.values.length; i++) {
        const d = Math.abs(this.values[i] - value);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      return this.values[best];
    }
    if (typeof this.step === "number" && this.step > 0) {
      return Math.round(value / this.step) * this.step;
    }
    return value;
  }

  setValue(value) {
    const next = clamp(this._snap(value), this.min, this.max);
    if (next === this.value) return this;
    this.value = next;
    this.onChange(this.value);
    return this;
  }

  // Shared geometry so onUpdate's hit-test matches onDraw exactly. The thumb is
  // inset by its radius at both ends so it never clips past the track.
  _metrics(pos) {
    const r = Math.max(7, pos.height * 0.45);
    const trackH = Math.max(4, pos.height * 0.3);
    const cy = pos.top + pos.height * 0.5;
    const inner = Math.max(1, pos.width - 2 * r);
    const t =
      this.max !== this.min
        ? (this.value - this.min) / (this.max - this.min)
        : 0;
    const thumbX = pos.left + r + t * inner;
    return { r, trackH, cy, inner, thumbX };
  }

  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    if (pos.width <= 0) return block;

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    this._over = !block && element.positionMeeting(mx, my);

    if (!this.readOnly) {
      if (this._over && mouse_check_button_pressed(mb_left)) this._hold = true;
      if (mouse_check_button_released(mb_left)) this._hold = false;
      if (this._hold) {
        const m = this._metrics(pos);
        const t = clamp((mx - pos.left - m.r) / m.inner, 0, 1);
        this.setValue(this.min + t * (this.max - this.min));
      }
    }

    return this._hold || this._over || block;
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();
    if (pos.width <= 0) return;

    const m = this._metrics(pos);
    const x1 = pos.left;
    const x2 = pos.left + pos.width;
    const ty1 = m.cy - m.trackH * 0.5;
    const ty2 = m.cy + m.trackH * 0.5;
    const rad = m.trackH * 0.5;
    const a0 = draw_get_alpha();
    draw_set_alpha(1);

    // Track + its inset edge.
    const trackCol = this._trackStyle.color ?? c_dkgray;
    draw_roundrect_color_ext(
      x1,
      ty1,
      x2,
      ty2,
      rad,
      rad,
      trackCol,
      trackCol,
      false,
    );
    if (this._trackStyle.border) {
      const bc = this._trackStyle.borderColor ?? c_black;
      draw_roundrect_color_ext(x1, ty1, x2, ty2, rad, rad, bc, bc, true);
    }

    // Fill from the left up to the thumb.
    const fillCol = this._fillStyle.color ?? c_white;
    const fillR = Math.max(x1 + rad, m.thumbX);
    draw_roundrect_color_ext(
      x1,
      ty1,
      fillR,
      ty2,
      rad,
      rad,
      fillCol,
      fillCol,
      false,
    );

    // Thumb — grows slightly while hovered/dragged for feedback.
    const tr = m.r * (this._hold || this._over ? 1.12 : 1);
    draw_set_alpha(this._thumbStyle.shadowAlpha ?? 0.3);
    draw_roundrect_color_ext(
      m.thumbX - tr,
      m.cy - tr + 2,
      m.thumbX + tr,
      m.cy + tr + 2,
      tr,
      tr,
      c_black,
      c_black,
      false,
    );
    draw_set_alpha(1);
    const thumbCol = this._thumbStyle.color ?? c_white;
    draw_roundrect_color_ext(
      m.thumbX - tr,
      m.cy - tr,
      m.thumbX + tr,
      m.cy + tr,
      tr,
      tr,
      thumbCol,
      thumbCol,
      false,
    );
    const thumbBorder = this._thumbStyle.borderColor ?? c_black;
    for (let i = 0; i < 2; i++) {
      draw_roundrect_color_ext(
        m.thumbX - tr + i,
        m.cy - tr + i,
        m.thumbX + tr - i,
        m.cy + tr - i,
        tr,
        tr,
        thumbBorder,
        thumbBorder,
        true,
      );
    }

    draw_set_alpha(a0);
  }
};
