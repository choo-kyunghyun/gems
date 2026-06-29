// Numeric `< n >` stepper — UISelect's arrow model over a min/max/step range. Without
// `wrap`, the arrow at a reached limit is dimmed and inert.
/** @implements {UIComponent} */
globalThis.UIStepper = class UIStepper {
  /** @param {Object} [stepper] { min, max, step, wrap, value, onChange, format, color, arrowColor, arrowHover, arrowDisabled, font, halign, valign } */
  constructor(stepper = {}) {
    this.min = stepper.min ?? 0;
    this.max = stepper.max ?? 10;
    this.step = stepper.step ?? 1;
    this.wrap = stepper.wrap ?? false;
    this.value = this._snap(stepper.value ?? this.min);
    this.onChange = stepper.onChange ?? noop;
    this.format = stepper.format ?? ((v) => `${v}`);

    this.color = stepper.color ?? c_white;
    this.arrowColor = stepper.arrowColor ?? c_gray;
    this.arrowHover = stepper.arrowHover ?? c_white;
    this.arrowDisabled = stepper.arrowDisabled ?? c_dkgray;
    this.font = stepper.font ?? -1;
    this.halign = stepper.halign ?? fa_center;
    this.valign = stepper.valign ?? fa_middle;

    this._enter = false;
    this._hold = false;
    this._side = 0; // -1 = over left arrow, 1 = right, 0 = not hovering
  }

  // snap onto the step grid from min; round to kill float drift (0.1 → 0.30000000000000004).
  _snap(v) {
    const snapped =
      this.min + Math.round((v - this.min) / this.step) * this.step;
    return clamp(Math.round(snapped * 1e6) / 1e6, this.min, this.max);
  }

  /** Snap + clamp `v` and fire onChange if it changed. @param {number} v @returns {UIStepper} */
  setValue(v) {
    const next = this._snap(v);
    if (next === this.value) return this;
    this.value = next;
    this.onChange(this.value);
    return this;
  }

  /** Step down by `step` (wraps to max if `wrap`). @returns {UIStepper} */
  decrement() {
    if (this.value <= this.min) {
      if (!this.wrap) return this;
      return this.setValue(this.max);
    }
    return this.setValue(this.value - this.step);
  }

  /** Step up by `step` (wraps to min if `wrap`). @returns {UIStepper} */
  increment() {
    if (this.value >= this.max) {
      if (!this.wrap) return this;
      return this.setValue(this.min);
    }
    return this.setValue(this.value + this.step);
  }

  /** @param {UIElement} element @param {boolean} block @returns {boolean} whether the pointer is captured */
  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return block; // unlaid-out (NaN) or zero-width

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    this._enter = !block && element.positionMeeting(mx, my);
    this._side = this._enter ? (mx < pos.left + pos.width * 0.5 ? -1 : 1) : 0;

    if (this._enter && UIPointer.pressed) this._hold = true;

    if (UIPointer.released) {
      if (this._hold && this._enter) {
        if (this._side < 0) this.decrement();
        else this.increment();
      }
      this._hold = false;
    }

    return this._hold || this._enter || block;
  }

  /** @param {UIElement} element */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return; // unlaid-out (NaN) or zero-width — skip this frame

    const font = draw_get_font();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const color = draw_get_color();

    if (this.font !== -1) draw_set_font(this.font);
    draw_set_valign(this.valign);

    const cy = pos.top + pos.height * 0.5;
    const pad = 14;
    const canDec = this.wrap || this.value > this.min;
    const canInc = this.wrap || this.value < this.max;

    // step arrows — dimmed when they can't step, brightened on hover.
    const ah = 5;
    drawUIArrow(
      pos.left + pad + ah,
      cy,
      "left",
      ah,
      !canDec ? this.arrowDisabled : this._side < 0 ? this.arrowHover : this.arrowColor,
    );
    drawUIArrow(
      pos.left + pos.width - pad - ah,
      cy,
      "right",
      ah,
      !canInc ? this.arrowDisabled : this._side > 0 ? this.arrowHover : this.arrowColor,
    );

    draw_set_halign(this.halign);
    draw_set_color(this.color);
    draw_text(pos.left + pos.width * 0.5, cy, this.format(this.value));

    draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_color(color);
  }

  // UINav: left/right steps value (horizontal nav adjusts instead of moving focus).
  /** @param {UIElement} element @param {number} dir -1 / +1 */
  navAxis(element, dir) {
    if (dir < 0) this.decrement();
    else this.increment();
  }
};
