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

  setIndex(i) {
    this._index = clamp(i, 0, this.items.length - 1);
    this.onChange(this._index, this.value);
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

  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return block; // unlaid-out (NaN) width — NaN <= 0 is false

    const pressed = mouse_check_button_pressed(mb_left);
    const released = mouse_check_button_released(mb_left);
    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    this._enter = !block && element.positionMeeting(mx, my);

    if (this._enter && pressed) this._hold = true;
    if (released) {
      if (this._hold && this._enter) this._toggle(element);
      this._hold = false;
    }
    return this._hold || this._enter || block;
  }

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
    const has = this.name !== "";
    draw_set_halign(this.halign);
    draw_set_color(has ? this.color : this.placeholderColor);
    const tx =
      this.halign === fa_center
        ? pos.left + pos.width * 0.5
        : this.halign === fa_right
          ? pos.left + pos.width - this.padX
          : pos.left + this.padX;
    draw_text(tx, cy, has ? this.name : this.placeholder);

    // Chevron at the right edge: "v" closed, "^" open. A draw_text glyph, not
    // draw_triangle (which renders nothing on GMRT — see CLAUDE.md).
    draw_set_halign(fa_right);
    draw_set_color(this.chevronColor);
    draw_text(pos.left + pos.width - this.padX, cy, this._open ? "^" : "v");

    draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_color(color);
  }

  // UINav: confirm opens the list (its presence also marks the field focusable). No
  // navAxis — a dropdown opens a list rather than cycling in place (use UISelect for
  // a left/right cycler).
  navActivate(element) {
    this._toggle(element);
  }
};
