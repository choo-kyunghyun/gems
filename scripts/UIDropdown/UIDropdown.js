// Combobox field — opens a popup list to pick (vs UISelect's in-place `< >` cycle), the
// better fit for many options. Owns only the closed field + selection; the popup is built
// by an injected onOpen(dropdown, field) so this Core widget stays theme-agnostic (gemsDropdown
// supplies the UIModal one), which calls notifyClosed() on dismiss. items: [{ name, value }].
/** @implements {UIComponent} */
globalThis.UIDropdown = class UIDropdown {
  /** @param {Object} [dd] { items: {name,value}[], index, onChange, onOpen, color, placeholder, placeholderColor, chevronColor, font, halign, padX } */
  constructor(dd = {}) {
    this.items = dd.items ?? [];
    this._index = dd.index ?? 0;
    this.onChange = dd.onChange ?? noop;
    // (dropdown, fieldElement) => void — opens the popup list. Supplied by the factory.
    this.onOpen = dd.onOpen ?? noop;

    this.color = dd.color ?? c_white;
    this.placeholder = dd.placeholder ?? "";
    this.placeholderColor = dd.placeholderColor ?? c_gray;
    this.chevronColor = dd.chevronColor ?? c_gray;
    this.font = dd.font ?? -1;
    this.halign = dd.halign ?? fa_left;
    this.padX = dd.padX ?? 12;

    this._open = false; // popup currently shown — drives the chevron direction
    this._enter = false;
    this._hold = false;
  }

  // METHOD not `get index()`: a getter named `index` faults on GMRT 0.20 (shadows a GM
  // built-in) even returning a stored field. Pairs with setIndex(). See CLAUDE.md.
  /** @returns {number} the selected index */
  getIndex() {
    return this._index;
  }

  // getValue/getName are methods for the same reason as getIndex: a `get value()` accessor
  // faults like `index` (both shadow GM built-ins). get name() worked but stays a method too.
  /** @returns {*} the selected item's value (undefined if empty) */
  getValue() {
    const item = this.items[this._index];
    return item ? item.value : undefined;
  }

  /** @returns {string} the selected item's display name ("" if empty) */
  getName() {
    const item = this.items[this._index];
    return item ? item.name : "";
  }

  /** Select index `i` (clamped). @param {number} i @returns {UIDropdown} */
  setIndex(i) {
    this._index = clamp(i, 0, this.items.length - 1);
    this.onChange(this._index, this.getValue());
    return this;
  }

  // opener calls this on dismiss — flips the chevron back and re-allows opening.
  notifyClosed() {
    this._open = false;
  }

  _toggle(element) {
    if (this._open || this.items.length === 0) return;
    this._open = true;
    this.onOpen(this, element);
  }

  /** @param {UIElement} element @param {boolean} block @returns {boolean} whether the pointer is captured */
  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return block; // unlaid-out (NaN) width — NaN <= 0 is false

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    this._enter = !block && element.positionMeeting(mx, my);

    if (this._enter && UIPointer.pressed) this._hold = true;
    if (UIPointer.released) {
      if (this._hold && this._enter) this._toggle(element);
      this._hold = false;
    }
    return this._hold || this._enter || block;
  }

  /** @param {UIElement} element */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return; // unlaid-out (NaN) width — NaN <= 0 is false

    const font = draw_get_font();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const color = draw_get_color();

    if (this.font !== -1) draw_set_font(this.font);
    draw_set_valign(fa_middle);
    const cy = pos.top + pos.height * 0.5;

    // current value, or placeholder when nothing is selected / list is empty.
    const label = this.getName();
    const has = label !== "";
    draw_set_halign(this.halign);
    draw_set_color(has ? this.color : this.placeholderColor);
    const tx =
      this.halign === fa_center
        ? pos.left + pos.width * 0.5
        : this.halign === fa_right
          ? pos.left + pos.width - this.padX
          : pos.left + this.padX;
    draw_text(tx, cy, has ? label : this.placeholder);

    // chevron: down when closed, up when open.
    const ah = 4;
    drawUIArrow(
      pos.left + pos.width - this.padX - ah,
      cy,
      this._open ? "up" : "down",
      ah,
      this.chevronColor,
    );

    draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_color(color);
  }

  // UINav: confirm opens the list; presence marks the field focusable. No navAxis — use
  // UISelect for a left/right cycler.
  /** @param {UIElement} element */
  navActivate(element) {
    this._toggle(element);
  }
};
