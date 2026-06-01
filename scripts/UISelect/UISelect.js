/**
 * @implements {UIComponent}
 * TODO: Broken
 */
globalThis.UISelect = class UISelect {
  constructor(select = {}) {
    this.items = select.items ?? [];
    this._index = select.index ?? 0;
    this.onChange = select.onChange ?? noop;
    this.color = select.color ?? c_white;
    this.font = select.font ?? -1;
    this.halign = select.halign ?? fa_center;
    this.valign = select.valign ?? fa_middle;
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

  setIndex(i) {
    this._index = clamp(i, 0, this.items.length - 1);
    this.onChange(this._index, this.value);
    return this;
  }

  insertItem(name, value, i = this.items.length) {
    this.items.splice(i, 0, { name, value });
    return this;
  }

  onDraw(element) {
    if (this.items.length === 0) return;

    const pos = element.getLayoutPosition();
    const font = draw_get_font();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const color = draw_get_color();

    if (this.font !== -1) draw_set_font(this.font);
    draw_set_halign(this.halign);
    draw_set_valign(this.valign);
    draw_set_color(this.color);

    draw_text(
      pos.left + pos.width * 0.5,
      pos.top + pos.height * 0.5,
      this.name,
    );

    draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_color(color);
  }
};
