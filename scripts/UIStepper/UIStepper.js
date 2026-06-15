/**
 * @implements {UIComponent}
 * Numeric `< n >` stepper — the UISelect arrow model over a min/max/step range
 * instead of a list. The left half steps down, the right half steps up; the value
 * is shown centered through `format`. Holds its own value and calls onChange (like
 * UISlider/UISelect). Without `wrap`, the arrow at a reached limit is dimmed and
 * does nothing.
 *
 * GMRT notes (both learned the hard way here):
 *  - Guard `!(pos.width > 0)` before drawing. On the first frame after a scene
 *    transition the flexpanel layout hasn't been computed yet, so getLayoutPosition
 *    returns NaN width/height; drawing with NaN coords faults. `NaN <= 0` is false,
 *    so the usual `pos.width <= 0` guard does NOT catch it — test `> 0` instead.
 *  - No class getters. GMRT 0.19 does not reliably invoke a `get x()` accessor
 *    (the body never runs, the read yields undefined), so the can-step checks are
 *    inlined as plain locals.
 */
globalThis.UIStepper = class UIStepper {
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

  // Clamp to range and snap onto the step grid measured from min; round to kill
  // float drift (e.g. 0.1 steps producing 0.30000000000000004).
  _snap(v) {
    const snapped =
      this.min + Math.round((v - this.min) / this.step) * this.step;
    return clamp(Math.round(snapped * 1e6) / 1e6, this.min, this.max);
  }

  setValue(v) {
    const next = this._snap(v);
    if (next === this.value) return this;
    this.value = next;
    this.onChange(this.value);
    return this;
  }

  decrement() {
    if (this.value <= this.min) {
      if (!this.wrap) return this;
      return this.setValue(this.max);
    }
    return this.setValue(this.value - this.step);
  }

  increment() {
    if (this.value >= this.max) {
      if (!this.wrap) return this;
      return this.setValue(this.min);
    }
    return this.setValue(this.value + this.step);
  }

  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return block; // unlaid-out (NaN) or zero-width

    const pressed = mouse_check_button_pressed(mb_left);
    const released = mouse_check_button_released(mb_left);
    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    this._enter = !block && element.positionMeeting(mx, my);
    this._side = this._enter ? (mx < pos.left + pos.width * 0.5 ? -1 : 1) : 0;

    if (this._enter && pressed) this._hold = true;

    if (released) {
      if (this._hold && this._enter) {
        if (this._side < 0) this.decrement();
        else this.increment();
      }
      this._hold = false;
    }

    return this._hold || this._enter || block;
  }

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
    // Inlined (no getters — GMRT doesn't invoke class accessors).
    const canDec = this.wrap || this.value > this.min;
    const canInc = this.wrap || this.value < this.max;

    // Left / right step arrows — filled triangles (draw_triangle_color works on GMRT 0.20),
    // dimmed when they can't step, brightened while hovered.
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

    // Current value, centered.
    draw_set_halign(this.halign);
    draw_set_color(this.color);
    draw_text(pos.left + pos.width * 0.5, cy, this.format(this.value));

    draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_color(color);
  }

  // UINav: left/right steps the value (horizontal nav adjusts instead of moving
  // focus). Marks the element focusable.
  navAxis(element, dir) {
    if (dir < 0) this.decrement();
    else this.increment();
  }
};
