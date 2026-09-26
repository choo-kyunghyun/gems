/**
 * Boolean toggle, drawn as a checkbox or a switch.
 * @implements {UIComponent}
 */
globalThis.UICheckbox = class UICheckbox {
  constructor(box = {}) {
    this._get = box.getValue ?? (() => box.value ?? false);
    this.onToggle = box.onToggle ?? noop;
    this.readOnly = box.readOnly ?? false;
    this.focusable = true;
    this.style = box.style ?? "check"; // "check" | "switch"
    this.animSpeed = box.animSpeed ?? 16;

    this.colorOff = box.colorOff ?? c_dkgray; // box/track when off
    this.colorOn = box.colorOn ?? c_lime; // box/track when on
    this.colorKnob = box.colorKnob ?? c_white; // knob / tick
    this.colorBorder = box.colorBorder ?? c_black;

    this._fsm = new UITrigger({ onClick: () => this.onToggle() });
    this._t = undefined; // eased 0..1 toward the on/off state
  }

  onUpdate(element, block) {
    this._fsm.readOnly = this.readOnly;
    return this._fsm.onUpdate(element, block);
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();
    const on = !!this._get();
    const target = on ? 1 : 0;
    this._t =
      this._t === undefined
        ? target
        : approach(this._t, target, this.animSpeed);
    const t = this._t;

    const cy = pos.top + pos.height * 0.5;
    const right = pos.left + pos.width;
    const a0 = draw_get_alpha();
    draw_set_alpha(1);
    const bg = merge_color(this.colorOff, this.colorOn, t);

    // a switch is a capsule track, a check a rounded square; both sit at the right edge
    const sw = this.style === "switch";
    const h = sw ? Math.max(16, pos.height * 0.58) : Math.max(14, pos.height * 0.7);
    const w = sw ? h * 1.85 : h;
    const rad = sw ? h * 0.5 : Math.max(2, h * 0.18);
    const x1 = right - w;
    const y1 = cy - h * 0.5;
    const y2 = cy + h * 0.5;
    const bc = this.colorBorder;
    draw_roundrect_color_ext(x1, y1, right, y2, rad, rad, bg, bg, false);
    draw_roundrect_color_ext(x1, y1, right, y2, rad, rad, bc, bc, true);

    if (sw) {
      const kr = rad - Math.max(2, h * 0.14);
      const kx = x1 + rad + t * (w - 2 * rad); // between the cap centers, so roundness matches
      const knobCol = element.state.hover
        ? merge_color(this.colorKnob, c_white, 0.35)
        : this.colorKnob;
      draw_circle_color(kx, cy, kr, knobCol, knobCol, false);
    } else if (t > 0.01) {
      // the stroke keeps the full box's width while the tick grows
      UIDraw.check(x1 + w * 0.5, cy, h * t, this.colorKnob, Math.max(2, h * 0.12));
    }

    draw_set_alpha(a0);
  }

  /** A confirm toggles the box. */
  onNav(element, ev) {
    if (ev.kind !== "confirm" || this.readOnly) return false;
    this.onToggle();
    return true;
  }
};
