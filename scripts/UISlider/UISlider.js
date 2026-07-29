// Draggable slider — continuous, stepped, or snapped to a `values` array. Draws immediate-mode.
/** @implements {UIComponent} */
globalThis.UISlider = class UISlider {
  static VALUE_W = 58; // right-side width reserved for the value readout (showValue); wide enough that "100%" at the 16px body font clears the thumb

  /** @param {Object} [slider] { min, max, value, step, values, readOnly, onChange, showValue, format, valueColor, font, track, fill, thumb } */
  constructor(slider = {}) {
    this.min = slider.min ?? 0;
    this.max = slider.max ?? 1;
    this.value = slider.value ?? this.min;
    this.step = slider.step;
    this.values = slider.values;
    this.readOnly = slider.readOnly ?? false;
    this.onChange = slider.onChange ?? noop;

    // readout at the right end; track reserves VALUE_W so text never overlaps the thumb.
    this.showValue = slider.showValue ?? true;
    this.format = slider.format ?? null;
    this.valueColor = slider.valueColor ?? c_white;
    this.valueFont = slider.font ?? -1; // -1 → current draw font

    // style structs: { color, rad?, border?, borderColor?, shadowAlpha? }
    this._trackStyle = slider.track ?? {};
    this._fillStyle = slider.fill ?? {};
    this._thumbStyle = slider.thumb ?? {};

    // internal FSM delegate (UITrigger) — no callbacks; the drag below reads its hold flag. It
    // owns readOnly (which never latches hold), so this field only gates the nav path below.
    this._fsm = new UITrigger({ readOnly: this.readOnly });
  }

  /**
   * @param {number} value
   * @returns {number}
   */
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

  /**
   * Snap + clamp `value` into range and fire onChange if it changed.
   * @param {number} value
   * @returns {UISlider}
   */
  setValue(value) {
    const next = clamp(this._snap(value), this.min, this.max);
    if (next === this.value) return this;
    this.value = next;
    this.onChange(this.value);
    return this;
  }

  /**
   * shared geometry so the hit-test matches the draw; thumb inset by its radius so it never clips the track.
   * @param {{left:number, top:number, width:number, height:number}} pos
   * @returns {{r:number, trackH:number, cy:number, inner:number, thumbX:number, trackW:number}}
   */
  _metrics(pos) {
    const r = Math.max(7, pos.height * 0.45);
    const trackH = Math.max(4, pos.height * 0.3);
    const cy = pos.top + pos.height * 0.5;
    const trackW = Math.max(
      2 * r,
      pos.width - (this.showValue ? UISlider.VALUE_W : 0),
    );
    const inner = Math.max(1, trackW - 2 * r);
    const t =
      this.max !== this.min
        ? (this.value - this.min) / (this.max - this.min)
        : 0;
    const thumbX = pos.left + r + t * inner;
    return { r, trackH, cy, inner, thumbX, trackW };
  }

  /**
   * decimal places for the default readout, from `step` (continuous → 2).
   * @returns {number}
   */
  _decimals() {
    if (typeof this.step !== "number" || this.step <= 0) return 2;
    let dec = 0;
    let s = this.step;
    while (Math.abs(s - Math.round(s)) > 1e-9 && dec < 6) {
      s *= 10;
      dec++;
    }
    return dec;
  }

  /** @returns {string} */
  _valueText() {
    if (this.format !== null) return this.format(this.value);
    return string_format(this.value, 0, this._decimals());
  }

  /**
   * @param {UIElement} element
   * @param {boolean} block
   * @returns {boolean} whether the pointer is captured
   */
  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    const result = this._fsm.onUpdate(element, block);

    // drag: the FSM latches hold on the press frame (value jumps immediately) and clears it
    // during the release-frame update (no set on release) — same order as before delegation.
    if (this._fsm.hold) {
      const mx = device_mouse_x_to_gui(0);
      const m = this._metrics(pos);
      const t = clamp((mx - pos.left - m.r) / m.inner, 0, 1);
      this.setValue(this.min + t * (this.max - this.min));
    }

    return result;
  }

  /** @param {UIElement} element */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    const m = this._metrics(pos);
    const x1 = pos.left;
    const x2 = pos.left + m.trackW;
    const ty1 = m.cy - m.trackH * 0.5;
    const ty2 = m.cy + m.trackH * 0.5;
    const rad = m.trackH * 0.5;
    const a0 = draw_get_alpha();
    draw_set_alpha(1);

    // border (if any) strokes UNDER the fill — the fill capsule covers its left span.
    const fillR = Math.max(x1 + rad, m.thumbX);
    drawUIBar(
      x1,
      ty1,
      x2,
      ty2,
      rad,
      fillR,
      this._trackStyle,
      this._fillStyle,
      false,
    );

    // thumb grows slightly while hovered/dragged for feedback.
    const tr = m.r * (element.state.held || element.state.hover ? 1.12 : 1);
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
    drawUIOutline(
      m.thumbX - tr,
      m.cy - tr,
      m.thumbX + tr,
      m.cy + tr,
      tr,
      thumbBorder,
      2,
    );

    if (this.showValue) {
      const ph = draw_get_halign();
      const pv = draw_get_valign();
      const pf = draw_get_font();
      const vf = resolveUIFont(this.valueFont);
      if (vf !== -1) draw_set_font(vf);
      draw_set_halign(fa_right);
      draw_set_valign(fa_middle);
      const c = this.valueColor;
      draw_text_color(
        pos.left + pos.width,
        m.cy,
        this._valueText(),
        c,
        c,
        c,
        c,
        1,
      );
      draw_set_halign(ph);
      draw_set_valign(pv);
      if (vf !== -1) draw_set_font(pf);
    }

    draw_set_alpha(a0);
  }

  // UINav: left/right nudges value by `step` (or 1/20 range when continuous).
  /**
   * @param {UIElement} element
   * @param {number} dir -1 / +1
   */
  navAxis(element, dir) {
    if (this.readOnly) return;
    const inc =
      typeof this.step === "number" && this.step > 0
        ? this.step
        : (this.max - this.min) / 20;
    this.setValue(this.value + dir * inc);
  }
};
