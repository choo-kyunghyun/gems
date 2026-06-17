/**
 * @implements {UIComponent}
 * UIDropdown — a combobox field: shows the current selection, and on click (or nav
 * confirm) drops a popup list to pick a new one. Unlike UISelect (which cycles in
 * place with `< >`), this opens a list — the better fit when there are many options
 * (resolutions, locales).
 *
 * This component owns only the CLOSED field + the selection state. Building the popup
 * list is delegated to an injected `onOpen(dropdown, fieldElement)` callback so this
 * Core widget stays theme-agnostic — the popup's look/position/animation is the GemsUI
 * kit's concern (see gemsDropdown). The opener builds a positioned UIModal root (which
 * blocks the rows behind it, draws on top, closes on outside-click/Esc, and is UINav-
 * navigable for free) and calls `notifyClosed()` when it dismisses. Mirrors how
 * VirtualKeyboard delegates its on-screen keyboard to a gemsModal.
 *
 * items: [{ name, value }] — same shape as UISelect.
 */
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

  // A METHOD, not a `get index()` accessor: on GMRT 0.20, reading an instance getter
  // *named `index`* faults with "cannot coerce undefined or null value into object"
  // (even though it just returns a stored field, and sibling getters value/name work) —
  // `index` is special in GameMaker. Pairs with setIndex(). See CLAUDE.md GMRT-Safe Idioms.
  /** @returns {number} the selected index */
  getIndex() {
    return this._index;
  }

  // value/name are METHODS, not get accessors, for the same GMRT 0.20 reason as getIndex()
  // above: `getValue` because a `get value()` accessor faults like `index` (both names shadow
  // GameMaker built-ins). `get name()` happened to work, but the whole selection surface is
  // exposed as get*() methods for consistency and to dodge any further reserved-name landmine.
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

  // The opener calls this when the popup is dismissed, so the field flips the chevron
  // back and allows re-opening.
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

    // Current value (or the placeholder when nothing is selected / list is empty).
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

    // Chevron at the right edge (via drawUIArrow): down when closed, up when open.
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

  // UINav: confirm opens the list (its presence also marks the field focusable). No
  // navAxis — a dropdown opens a list rather than cycling in place (use UISelect for
  // a left/right cycler).
  /** @param {UIElement} element */
  navActivate(element) {
    this._toggle(element);
  }
};
