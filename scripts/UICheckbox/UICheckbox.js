// Boolean toggle — checkbox (box + tick) or switch (pill + knob) per `style`.
// Drawn immediate-mode in onDraw; eases on Time.raw so it animates while the sim is paused.
/** @implements {UIComponent} */
globalThis.UICheckbox = class UICheckbox {
  constructor(box = {}) {
    this._get = box.getValue ?? (() => box.value ?? false); // static or live source
    this.onToggle = box.onToggle ?? noop;
    this.readOnly = box.readOnly ?? false;
    this.style = box.style ?? "check"; // "check" | "switch"
    this.animSpeed = box.animSpeed ?? 16;

    this.colorOff = box.colorOff ?? c_dkgray; // box/track when off
    this.colorOn = box.colorOn ?? c_lime; // box/track when on
    this.colorKnob = box.colorKnob ?? c_white; // knob / tick
    this.colorBorder = box.colorBorder ?? c_black;

    // internal FSM delegate (UITrigger) — runs hover/press/commit and writes element.state.
    this._fsm = new UITrigger({
      onClick: () => {
        if (!this.readOnly) this.onToggle();
      },
    });
    this._t = undefined; // eased 0..1 toward the current on/off state
  }

  /** @param {UIElement} element @param {boolean} block @returns {boolean} whether the pointer is captured */
  onUpdate(element, block) {
    const result = this._fsm.onUpdate(element, block);
    // readOnly: hover still captures (blocks below) but a press must not latch capture on
    // drag-off — matches the pre-delegation behavior where readOnly never set _hold.
    return this.readOnly ? this._fsm.enter || block : result;
  }

  /** @param {UIElement} element */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    const on = !!this._get();
    // Tween.approach runs on Time.raw — UI must animate even when sim is paused/dilated.
    const target = on ? 1 : 0;
    this._t =
      this._t === undefined
        ? target
        : Tween.approach(this._t, target, this.animSpeed);
    const t = this._t;

    const cy = pos.top + pos.height * 0.5;
    const right = pos.left + pos.width;
    const a0 = draw_get_alpha();
    draw_set_alpha(1);
    const bg = merge_color(this.colorOff, this.colorOn, t);

    if (this.style === "switch") {
      // pill track; knob travels between cap centers so roundness matches.
      const h = Math.max(16, pos.height * 0.58);
      const w = h * 1.85;
      const x2 = right;
      const x1 = x2 - w;
      const ty1 = cy - h * 0.5;
      const ty2 = cy + h * 0.5;
      const rad = h * 0.5;
      draw_roundrect_color_ext(x1, ty1, x2, ty2, rad, rad, bg, bg, false);
      draw_roundrect_color_ext(
        x1,
        ty1,
        x2,
        ty2,
        rad,
        rad,
        this.colorBorder,
        this.colorBorder,
        true,
      );
      const margin = Math.max(2, h * 0.14);
      const kr = rad - margin;
      const kx = x1 + rad + t * (w - 2 * rad); // between the cap centers
      draw_set_alpha(0.22);
      draw_circle_color(kx, cy + 1, kr, c_black, c_black, false);
      draw_set_alpha(1);
      const knobCol = element.state.hover
        ? merge_color(this.colorKnob, c_white, 0.35)
        : this.colorKnob;
      draw_circle_color(kx, cy, kr, knobCol, knobCol, false);
    } else {
      const s = Math.max(14, pos.height * 0.7);
      const bx2 = right;
      const bx1 = bx2 - s;
      const by1 = cy - s * 0.5;
      const by2 = cy + s * 0.5;
      const rad = Math.max(2, s * 0.18);
      draw_roundrect_color_ext(bx1, by1, bx2, by2, rad, rad, bg, bg, false);
      draw_roundrect_color_ext(
        bx1,
        by1,
        bx2,
        by2,
        rad,
        rad,
        this.colorBorder,
        this.colorBorder,
        true,
      );
      if (t > 0.01) {
        const cx = (bx1 + bx2) * 0.5;
        drawUICheck(cx, cy, s * t, this.colorKnob, Math.max(2, s * 0.12));
      }
    }

    draw_set_alpha(a0);
  }

  // UINav: confirm toggles; presence marks element focusable.
  /** @param {UIElement} element */
  navActivate(element) {
    if (!this.readOnly) this.onToggle();
  }
};
