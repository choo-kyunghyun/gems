/**
 * @implements {UIComponent}
 * A real visual boolean toggle — either a checkbox (box + tick) or a switch
 * (pill + sliding knob), picked by `style`. Self-contained: it hit-tests and
 * handles its own click (no UITrigger), reads a live getValue() each frame, and
 * calls onToggle() on a click release. Drawn directly in onDraw (immediate-mode)
 * with Time.raw easing for the knob slide / tick + color fade.
 *
 * The control graphic is right-aligned inside the element and vertically centered,
 * so a gemsRow-style label to its left reads as one settings row; the whole element
 * is the click target.
 */
globalThis.UICheckbox = class UICheckbox {
  constructor(box = {}) {
    // Static `value` or a live `getValue()` — coerced to boolean.
    this._get = box.getValue ?? (() => box.value ?? false);
    this.onToggle = box.onToggle ?? noop;
    this.readOnly = box.readOnly ?? false;
    this.style = box.style ?? "check"; // "check" | "switch"
    this.animSpeed = box.animSpeed ?? 16;

    this.colorOff = box.colorOff ?? c_dkgray; // box/track when off
    this.colorOn = box.colorOn ?? c_lime; // box/track when on
    this.colorKnob = box.colorKnob ?? c_white; // knob / tick
    this.colorBorder = box.colorBorder ?? c_black;

    this._over = false;
    this._hold = false;
    this._t = undefined; // eased 0..1 toward the current on/off state
  }

  /** @param {UIElement} element @param {boolean} block @returns {boolean} whether the pointer is captured */
  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return block; // unlaid-out (NaN) or zero-width — NaN <= 0 is false

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    this._over = !block && element.positionMeeting(mx, my);

    if (!this.readOnly) {
      if (this._over && UIPointer.pressed) this._hold = true;
      if (UIPointer.released) {
        if (this._hold && this._over) this.onToggle();
        this._hold = false;
      }
    }
    return this._hold || this._over || block;
  }

  /** @param {UIElement} element */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return; // unlaid-out (NaN) or zero-width — NaN <= 0 is false

    const on = !!this._get();
    // Time.raw (wall-clock), not Time.delta — UI must ignore Time.scale so the
    // toggle still animates when the sim is time-dilated or paused.
    const f = clamp(Time.raw * this.animSpeed, 0, 1);
    const target = on ? 1 : 0;
    this._t = this._t === undefined ? target : this._t + (target - this._t) * f;
    const t = this._t;

    const cy = pos.top + pos.height * 0.5;
    const right = pos.left + pos.width;
    const a0 = draw_get_alpha();
    draw_set_alpha(1);
    const bg = merge_color(this.colorOff, this.colorOn, t);

    if (this.style === "switch") {
      // Pill track + circular knob. The track is a full pill (corner radius = half
      // its height); the knob is inset from that by a uniform margin and travels
      // between the two cap centers, so the knob stays concentric with the pill's
      // rounded ends and their roundness reads as matched.
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
      // Soft drop under the knob, then the knob (brightened slightly on hover).
      draw_set_alpha(0.22);
      draw_circle_color(kx, cy + 1, kr, c_black, c_black, false);
      draw_set_alpha(1);
      const knobCol = this._over
        ? merge_color(this.colorKnob, c_white, 0.35)
        : this.colorKnob;
      draw_circle_color(kx, cy, kr, knobCol, knobCol, false);
    } else {
      // Square box; tick fades in over the on color.
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
        // Checked = the shared drawUICheck checkmark, popping in (size scaled by the eased t).
        const cx = (bx1 + bx2) * 0.5;
        drawUICheck(cx, cy, s * t, this.colorKnob, Math.max(2, s * 0.12));
      }
    }

    draw_set_alpha(a0);
  }

  // UINav: confirm toggles (unless read-only). Marks the element focusable.
  /** @param {UIElement} element */
  navActivate(element) {
    if (!this.readOnly) this.onToggle();
  }
};
