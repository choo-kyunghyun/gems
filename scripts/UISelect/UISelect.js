/**
 * Inline ◀/▶ cycler.
 * @implements {UIComponent}
 */
globalThis.UISelect = class UISelect {
  /** select: { items: {name,value}[], index, onChange, color, arrowColor, arrowHover, font, halign, valign } */
  constructor(select = {}) {
    this.items = select.items ?? [];
    this._index = select.index ?? 0;
    this.onChange = select.onChange ?? noop;
    this.color = select.color ?? c_white;
    this.arrowColor = select.arrowColor ?? c_gray;
    this.arrowHover = select.arrowHover ?? c_white;
    this.font = select.font ?? -1;
    this.halign = select.halign ?? fa_center;
    this.valign = select.valign ?? fa_middle;
    // -1 = cursor over left arrow, 1 = right, 0 = not hovering.
    this._side = 0;
    // its onClick reads the _side latched earlier in the same onUpdate
    this._fsm = new UITrigger({
      onClick: () => {
        if (this._side < 0) this.retreat();
        else this.advance();
      },
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

  /** Wraps. */
  advance() {
    if (this.items.length === 0) return this;
    this._index = (this._index + 1) % this.items.length;
    this.onChange(this._index, this.getValue());
    return this;
  }

  /** Wraps. */
  retreat() {
    if (this.items.length === 0) return this;
    this._index = (this._index - 1 + this.items.length) % this.items.length;
    this.onChange(this._index, this.getValue());
    return this;
  }

  /** Clamped. */
  setIndex(i) {
    this._index = clamp(i, 0, this.items.length - 1);
    this.onChange(this._index, this.getValue());
    return this;
  }

  insertItem(name, value, i = this.items.length) {
    this.items.splice(i, 0, { name, value });
    return this;
  }

  onUpdate(element, block) {
    // latched before the trigger runs: its onClick commits by this frame's side
    this._side = UIDraw.pointerSide(element, block);
    return this._fsm.onUpdate(element, block);
  }

  onDraw(element) {
    if (this.items.length === 0) return;

    const pos = element.getLayoutPosition();
    const st = UIDraw.save();

    const fnt = UIDraw.font(this.font);
    if (fnt !== -1) draw_set_font(fnt);
    draw_set_valign(this.valign);

    const cy = UIDraw.arrowPair(
      pos,
      this._side < 0 ? this.arrowHover : this.arrowColor,
      this._side > 0 ? this.arrowHover : this.arrowColor,
    );

    draw_set_halign(this.halign);
    draw_set_color(this.color);
    draw_text(pos.left + pos.width * 0.5, cy, this.getName());

    UIDraw.restore(st);
  }

  /** Horizontal nav adjusts the value instead of moving focus. */
  navAxis(element, dir) {
    if (dir < 0) this.retreat();
    else this.advance();
  }

  navActivate(element) {
    this.advance();
  }
};
