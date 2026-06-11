/**
 * @implements {UIComponent}
 * A real visual boolean toggle — either a checkbox (box + tick) or a switch
 * (pill + sliding knob), picked by `style`. Self-contained: it hit-tests and
 * handles its own click (no UITrigger), reads a live getValue() each frame, and
 * calls onToggle() on a click release. Drawn directly in onDraw with Time.delta
 * easing for the knob slide / tick + color fade (no flexpanel mutation, bug #15065).
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

  onUpdate(element, block) {
    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    this._over = !block && element.positionMeeting(mx, my);

    if (!this.readOnly) {
      if (this._over && mouse_check_button_pressed(mb_left)) this._hold = true;
      if (mouse_check_button_released(mb_left)) {
        if (this._hold && this._over) this.onToggle();
        this._hold = false;
      }
    }
    return this._hold || this._over || block;
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();
    if (pos.width <= 0) return;

    const on = !!this._get();
    const f = clamp(Time.delta * this.animSpeed, 0, 1);
    const target = on ? 1 : 0;
    this._t = this._t === undefined ? target : this._t + (target - this._t) * f;
    const t = this._t;

    const cy = pos.top + pos.height * 0.5;
    const right = pos.left + pos.width;
    const a0 = draw_get_alpha();
    draw_set_alpha(1);
    const bg = merge_color(this.colorOff, this.colorOn, t);

    if (this.style === "switch") {
      // Pill track + knob sliding left→right.
      const h = Math.max(14, pos.height * 0.62);
      const w = h * 1.9;
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
      const kr = rad - 2 + (this._over ? 1 : 0);
      const kx = x1 + rad + t * (w - 2 * rad);
      draw_circle_color(kx, cy, kr, this.colorKnob, this.colorKnob, false);
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
        draw_set_alpha(t);
        const lw = Math.max(2, s * 0.12);
        // Tick: down-stroke into the lower-left, up-stroke to the upper-right.
        draw_line_width_color(
          bx1 + s * 0.24,
          by1 + s * 0.52,
          bx1 + s * 0.42,
          by1 + s * 0.72,
          lw,
          this.colorKnob,
          this.colorKnob,
        );
        draw_line_width_color(
          bx1 + s * 0.42,
          by1 + s * 0.72,
          bx1 + s * 0.76,
          by1 + s * 0.3,
          lw,
          this.colorKnob,
          this.colorKnob,
        );
        draw_set_alpha(1);
      }
    }

    draw_set_alpha(a0);
  }
};
