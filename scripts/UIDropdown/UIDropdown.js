// Combobox field — opens a popup list to pick (vs UISelect's in-place `< >` cycle), the better fit
// for many options. Owns only the closed field + selection. Contract on the class below.
/**
 * The popup is built by an injected onOpen(dropdown, field) so this Core widget stays theme-agnostic
 * (gemsDropdown supplies the UIModal one), which calls notifyClosed() on dismiss. items: [{ name, value }].
 * @implements {UIComponent}
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
    this._el = null; // host element, stashed each onUpdate for the onClick closure
    // internal FSM delegate (UITrigger) — commit on release-inside opens the popup.
    this._fsm = new UITrigger({
      onClick: () => this._toggle(this._el),
    });
  }

  // METHOD not `get index()` — house style; the old "getter shadowing a GM name faults"
  // report was dismissed (2026-07 re-audit). Pairs with setIndex().
  /** @returns {number} the selected index */
  getIndex() {
    return this._index;
  }

  // getValue/getName are methods for symmetry with getIndex (same house style).
  /** @returns {*} the selected item's value (undefined if empty) */
  getValue() {
    return uiItemValue(this.items, this._index);
  }

  /** @returns {string} the selected item's display name ("" if empty) */
  getName() {
    return uiItemName(this.items, this._index);
  }

  /** Select index `i` (clamped). @param {number} i @returns {UIDropdown} */
  setIndex(i) {
    this._index = clamp(i, 0, this.items.length - 1);
    this.onChange(this._index, this.getValue());
    return this;
  }

  /** opener calls this on dismiss — flips the chevron back and re-allows opening. */
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
    this._el = element;
    return this._fsm.onUpdate(element, block);
  }

  /** @param {UIElement} element */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    const st = uiDrawSave();

    const fnt = resolveUIFont(this.font);
    if (fnt !== -1) draw_set_font(fnt);
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

    uiDrawRestore(st);
  }

  // UINav: confirm opens the list; presence marks the field focusable. No navAxis — use
  // UISelect for a left/right cycler.
  /** @param {UIElement} element */
  navActivate(element) {
    this._toggle(element);
  }
};
