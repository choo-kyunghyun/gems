/** @implements {UIComponent} */
globalThis.UISelect = class UISelect {
  constructor(select = {}) {
    this.items = select.items ?? [];
    this._index = select.index ?? 0;
    this.onChange = select.onChange ?? noop;
    this.color = select.color ?? c_white;
    // Arrow affordances drawn at each edge ("<" / ">"); brighten on the hovered
    // side so the player reads it as a left/right cycler.
    this.arrowColor = select.arrowColor ?? c_gray;
    this.arrowHover = select.arrowHover ?? c_white;
    this.font = select.font ?? -1;
    this.halign = select.halign ?? fa_center;
    this.valign = select.valign ?? fa_middle;
    this._enter = false;
    this._hold = false;
    // -1 = cursor over left arrow, 1 = right, 0 = not hovering.
    this._side = 0;
  }

  get index() {
    return this._index;
  }

  get value() {
    const item = this.items[this._index];
    return item ? item.value : undefined;
  }

  get name() {
    const item = this.items[this._index];
    return item ? item.name : "";
  }

  advance() {
    if (this.items.length === 0) return this;
    this._index = (this._index + 1) % this.items.length;
    this.onChange(this._index, this.value);
    return this;
  }

  retreat() {
    if (this.items.length === 0) return this;
    this._index = (this._index - 1 + this.items.length) % this.items.length;
    this.onChange(this._index, this.value);
    return this;
  }

  setIndex(i) {
    this._index = clamp(i, 0, this.items.length - 1);
    this.onChange(this._index, this.value);
    return this;
  }

  insertItem(name, value, i = this.items.length) {
    this.items.splice(i, 0, { name, value });
    return this;
  }

  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return block; // unlaid-out (NaN) or zero-width — NaN <= 0 is false

    const pressed = mouse_check_button_pressed(mb_left);
    const released = mouse_check_button_released(mb_left);
    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    this._enter = !block && element.positionMeeting(mx, my);
    this._side = this._enter ? (mx < pos.left + pos.width * 0.5 ? -1 : 1) : 0;

    if (this._enter && pressed) this._hold = true;

    if (released) {
      // Left half steps back, right half steps forward.
      if (this._hold && this._enter) {
        if (this._side < 0) this.retreat();
        else this.advance();
      }
      this._hold = false;
    }

    return this._hold || this._enter || block;
  }

  onDraw(element) {
    if (this.items.length === 0) return;

    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return; // unlaid-out (NaN) or zero-width — NaN <= 0 is false

    const font = draw_get_font();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const color = draw_get_color();

    if (this.font !== -1) draw_set_font(this.font);
    draw_set_valign(this.valign);

    const cy = pos.top + pos.height * 0.5;
    const pad = 14;

    // Left arrow.
    draw_set_halign(fa_left);
    draw_set_color(this._side < 0 ? this.arrowHover : this.arrowColor);
    draw_text(pos.left + pad, cy, "<");

    // Right arrow.
    draw_set_halign(fa_right);
    draw_set_color(this._side > 0 ? this.arrowHover : this.arrowColor);
    draw_text(pos.left + pos.width - pad, cy, ">");

    // Current value, centered.
    draw_set_halign(this.halign);
    draw_set_color(this.color);
    draw_text(pos.left + pos.width * 0.5, cy, this.name);

    draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_color(color);
  }

  // UINav: left/right cycles the value (so horizontal nav adjusts instead of moving
  // focus); confirm advances. Both mark the element focusable.
  navAxis(element, dir) {
    if (dir < 0) this.retreat();
    else this.advance();
  }

  navActivate(element) {
    this.advance();
  }
};
