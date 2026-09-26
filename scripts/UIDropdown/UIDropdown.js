/**
 * A dropdown field whose list opens inline: while open, the caller-built `list` sits right after
 * the field in the field's parent, so it pushes what follows down. A click or a confirm on the
 * field toggles it; a press outside field and list, or a cancel from either, closes it. A pick is
 * the list's own: `setIndex`, then `close()`.
 * @implements {UIComponent}
 */
globalThis.UIDropdown = class UIDropdown {
  /** dd: { items: {name,value}[], index, onChange, list: UIElement, color, placeholder, placeholderColor, chevronColor, font, halign, padX } */
  constructor(dd = {}) {
    this.items = dd.items ?? [];
    this._index = dd.index ?? 0;
    this.onChange = dd.onChange ?? noop;
    this.list = dd.list ?? null;

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
      onClick: () => this._toggle(),
    });
    // the list is no descendant of the field, so a cancel from its rows is caught on the list
    if (this.list !== null) this.list.addComponent({ onNav: (el, ev) => this._cancel(ev) });
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

  isOpen() {
    return this._open;
  }

  /** Focuses the field, so a cancel finds the list even with the ring down. */
  open() {
    const field = this._el;
    if (this._open || this.list === null || field === null) return;
    if (field.parent === null || this.items.length === 0) return;
    this._open = true;
    field.parent.insertChild(this.list, field.parent.children.indexOf(field) + 1);
    UINav.focus(field);
  }

  /** Idempotent; a focus inside the list returns to the field. */
  close() {
    if (!this._open) return;
    this._open = false;
    let el = UINav.focused;
    while (el !== null) {
      if (el === this.list) {
        UINav.focus(this._el);
        break;
      }
      el = el.parent;
    }
    if (this.list.parent !== null) this.list.parent.removeChild(this.list);
  }

  _toggle() {
    if (this._open) this.close();
    else this.open();
  }

  _cancel(ev) {
    if (ev.kind !== "cancel" || !this._open) return false;
    this.close();
    return true;
  }

  onUpdate(element, block) {
    this._el = element;
    if (this._open ? Input.pointer.left.pressed : false) {
      const mx = Input.pointer.x;
      const my = Input.pointer.y;
      if (!element.positionMeeting(mx, my) ? !this.list.positionMeeting(mx, my) : false) this.close();
    }
    return this._fsm.onUpdate(element, block);
  }

  /** A closed list is out of the tree, so the field frees it. */
  onDestroy(element) {
    if (this.list !== null ? this.list.parent === null : false) this.list.destroy();
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

  onNav(element, ev) {
    this._el = element;
    if (ev.kind !== "confirm") return this._cancel(ev);
    this._toggle();
    return true;
  }
};
