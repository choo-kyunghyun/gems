/**
 * A dropdown field. The popup is built by an injected onOpen(dropdown, field), so this Core widget
 * stays theme-agnostic; the popup must call notifyClosed() on dismiss.
 * @implements {UIComponent}
 */
globalThis.UIDropdown = class UIDropdown {
  /** dd: { items: {name,value}[], index, onChange, onOpen, color, placeholder, placeholderColor, chevronColor, font, halign, padX } */
  constructor(dd = {}) {
    this.items = dd.items ?? [];
    this._index = dd.index ?? 0;
    this.onChange = dd.onChange ?? noop;
    // (dropdown, fieldElement) => void
    this.onOpen = dd.onOpen ?? noop;

    this.color = dd.color ?? c_white;
    this.placeholder = dd.placeholder ?? "";
    this.placeholderColor = dd.placeholderColor ?? c_gray;
    this.chevronColor = dd.chevronColor ?? c_gray;
    this.font = dd.font ?? -1;
    this.halign = dd.halign ?? fa_left;
    this.padX = dd.padX ?? 12;
    this.focusable = true;

    this._open = false;
    this._el = null; // stashed each onUpdate for the onClick closure
    this._fsm = new UITrigger({
      onClick: () => this._toggle(this._el),
    });
  }

  getIndex() {
    return this._index;
  }

  /** Undefined if empty. */
  getValue() {
    return UIDraw.itemValue(this.items, this._index);
  }

  /** "" if empty. */
  getName() {
    return UIDraw.itemName(this.items, this._index);
  }

  /** Clamps `i`; fires onChange. */
  setIndex(i) {
    this._index = clamp(i, 0, this.items.length - 1);
    this.onChange(this._index, this.getValue());
    return this;
  }

  /** The popup calls this on dismiss, re-allowing opening. */
  notifyClosed() {
    this._open = false;
  }

  _toggle(element) {
    if (this._open || this.items.length === 0) return;
    this._open = true;
    this.onOpen(this, element);
  }

  onUpdate(element, block) {
    this._el = element;
    return this._fsm.onUpdate(element, block);
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();
    const st = UIDraw.save();

    const fnt = UIDraw.font(this.font);
    if (fnt !== -1) draw_set_font(fnt);
    draw_set_valign(fa_middle);
    const cy = pos.top + pos.height * 0.5;

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

    const ah = 4;
    UIDraw.arrow(
      pos.left + pos.width - this.padX - ah,
      cy,
      this._open ? "up" : "down",
      ah,
      this.chevronColor,
    );

    UIDraw.restore(st);
  }

  /** A confirm opens the popup. */
  onNav(element, ev) {
    if (ev.kind !== "confirm") return false;
    this._toggle(element);
    return true;
  }
};
