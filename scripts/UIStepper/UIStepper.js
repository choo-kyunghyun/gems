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

    this._side = 0; // -1 = over left arrow, 1 = right, 0 = not hovering
    // internal FSM delegate (UITrigger); onClick reads the _side latched in onUpdate.
    this._fsm = new UITrigger({
      onClick: () => {
        if (this._side < 0) this.decrement();
        else this.increment();
      },
    });
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
    // latch the arrow side BEFORE the FSM runs — its onClick commits from this frame's _side.
    this._side = uiPointerSide(element, block);
    return this._fsm.onUpdate(element, block);
  }

  /** @param {UIElement} element */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    const st = uiDrawSave();

    const fnt = resolveUIFont(this.font);
    if (fnt !== -1) draw_set_font(fnt);
    draw_set_valign(this.valign);

    const canDec = this.wrap || this.value > this.min;
    const canInc = this.wrap || this.value < this.max;

    // step arrows — dimmed when they can't step, brightened on hover.
    const cy = drawUIArrowPair(
      pos,
      !canDec
        ? this.arrowDisabled
        : this._side < 0
          ? this.arrowHover
          : this.arrowColor,
      !canInc
        ? this.arrowDisabled
        : this._side > 0
          ? this.arrowHover
          : this.arrowColor,
    );

    draw_set_halign(this.halign);
    draw_set_color(this.color);
    draw_text(pos.left + pos.width * 0.5, cy, this.format(this.value));

    uiDrawRestore(st);
  }

  // UINav: left/right steps value (horizontal nav adjusts instead of moving focus).
  /** @param {UIElement} element @param {number} dir -1 / +1 */
  navAxis(element, dir) {
    if (dir < 0) this.decrement();
    else this.increment();
  }
};
