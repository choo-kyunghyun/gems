/**
 * @implements {UIComponent}
 * Slot grid with hover + single selection (inventory foundation). Whole grid drawn
 * immediate-mode across one element (no child-per-slot), so a large inventory is cheap.
 * `items` is a flat array of { sprite, subimg, count, color } or null. `sprite` MUST be
 * raster — SVG sprites report 0 frames + fault draw_sprite on GMRT (see CLAUDE.md).
 * GMRT: hover/selection read live each frame (no cached primitive bool to clobber).
 */
globalThis.UISlots = class UISlots {
  /** @param {Object} [s] { items, cols, cellSize, gap, pad, selected, onSelect, draggable, font, rad, slotColor, slotHover, borderColor, selectColor, countColor } */
  constructor(s = {}) {
    this.items = s.items ?? []; // flat array; entry is item-or-null
    this.cols = s.cols ?? 4;
    this.cellSize = s.cellSize ?? 64;
    this.gap = s.gap ?? 8;
    this.pad = s.pad ?? 8; // icon inset inside a cell
    this.selected = s.selected ?? -1;
    this.onSelect = s.onSelect ?? noop;
    this.draggable = s.draggable ?? false; // opt into SlotDrag pick-up/drop
    this.font = s.font ?? -1;
    this.rad = s.rad ?? 6;

    this.slotColor = s.slotColor ?? c_dkgray;
    this.slotHover = s.slotHover ?? c_gray;
    this.borderColor = s.borderColor ?? c_gray;
    this.selectColor = s.selectColor ?? c_white; // selection outline
    this.countColor = s.countColor ?? c_white;

    this._hover = -1; // hovered slot index, -1 = none
    this._inside = false; // instance field, not a local bool — see onUpdate (GMRT)
  }

  // top-left of slot i in gui space, relative to the laid-out rect.
  _slotXY(pos, i) {
    const step = this.cellSize + this.gap;
    return {
      x: pos.left + (i % this.cols) * step,
      y: pos.top + floor(i / this.cols) * step,
    };
  }

  /** @param {UIElement} element @param {boolean} block @returns {boolean} whether the pointer is captured */
  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return block; // unlaid-out (NaN) or zero-width

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);

    // hit-test into INSTANCE fields, not boolean local consts — on GMRT a local bool
    // can flip true→false mid-function (see CLAUDE.md), gating the hover branch wrongly.
    this._inside = !block && element.positionMeeting(mx, my);
    this._hover = -1;
    if (this._inside) {
      for (let i = 0; i < this.items.length; i++) {
        const p = this._slotXY(pos, i);
        if (
          point_in_rectangle(
            mx,
            my,
            p.x,
            p.y,
            p.x + this.cellSize,
            p.y + this.cellSize,
          )
        ) {
          this._hover = i;
          break;
        }
      }
    }

    if (this.draggable) {
      // filled slot → pick up; empty slot → select.
      if (this._inside && this._hover >= 0 && UIPointer.pressed) {
        if (this.items[this._hover] != null) {
          SlotDrag.begin(this, this._hover);
        } else {
          this._select(this._hover);
        }
        return true;
      }
      // report the hovered slot as drop target; SlotDrag.update resolves on release
      // using the last reported slot — drift-forgiving.
      if (SlotDrag.active && this._inside && this._hover >= 0) {
        SlotDrag.hover(this, this._hover);
        return true;
      }
    } else if (this._inside && this._hover >= 0 && UIPointer.pressed) {
      this._select(this._hover);
      return true;
    }
    return this._inside || block;
  }

  /** @param {number} i */
  _select(i) {
    this.selected = i;
    this.onSelect(i, this.items[i]);
  }

  /** @param {UIElement} element */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return; // unlaid-out (NaN) or zero-width

    const font = draw_get_font();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const color = draw_get_color();
    const a0 = draw_get_alpha();
    draw_set_alpha(1);

    const sz = this.cellSize;
    for (let i = 0; i < this.items.length; i++) {
      const p = this._slotXY(pos, i);
      const x1 = p.x + sz;
      const y1 = p.y + sz;

      // cell background.
      const bg = i === this._hover ? this.slotHover : this.slotColor;
      draw_roundrect_color_ext(
        p.x,
        p.y,
        x1,
        y1,
        this.rad,
        this.rad,
        bg,
        bg,
        false,
      );

      // icon (raster only). Aspect-preserving fit inside the cell's inner box: a non-square icon
      // (wide gun / tall item) keeps its shape instead of being squished into a square. A square
      // sprite fits identically to the old square stretch, so this is a no-op for those. stretched_ext
      // fills the given rect ignoring origin, so center by offset. (sprite_get_width/height are 0 for
      // SVG sprites — sprite_exists already gated those out; guard >0 anyway and fall back to the box.)
      const it = this.items[i];
      if (it != null && it.sprite != null && sprite_exists(it.sprite)) {
        const n = max(1, sprite_get_number(it.sprite));
        const sub = clamp(it.subimg ?? 0, 0, n - 1);
        const box = sz - this.pad * 2;
        const sw = sprite_get_width(it.sprite);
        const sh = sprite_get_height(it.sprite);
        const fit = sw > 0 && sh > 0 ? min(box / sw, box / sh) : 1;
        const dw = sw > 0 ? sw * fit : box;
        const dh = sh > 0 ? sh * fit : box;
        draw_sprite_stretched_ext(
          it.sprite,
          sub,
          p.x + this.pad + (box - dw) / 2,
          p.y + this.pad + (box - dh) / 2,
          dw,
          dh,
          it.color ?? c_white,
          1,
        );
      }

      // 2px accent outline if selected, else 1px border.
      if (i === this.selected) {
        draw_roundrect_color_ext(
          p.x,
          p.y,
          x1,
          y1,
          this.rad,
          this.rad,
          this.selectColor,
          this.selectColor,
          true,
        );
        draw_roundrect_color_ext(
          p.x + 1,
          p.y + 1,
          x1 - 1,
          y1 - 1,
          this.rad,
          this.rad,
          this.selectColor,
          this.selectColor,
          true,
        );
      } else {
        draw_roundrect_color_ext(
          p.x,
          p.y,
          x1,
          y1,
          this.rad,
          this.rad,
          this.borderColor,
          this.borderColor,
          true,
        );
      }
    }

    // counts drawn last so the selection outline never covers them.
    if (this.font !== -1) draw_set_font(this.font);
    draw_set_halign(fa_right);
    draw_set_valign(fa_bottom);
    draw_set_color(this.countColor);
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it != null && it.count != null && it.count > 1) {
        const p = this._slotXY(pos, i);
        draw_text(p.x + sz - 4, p.y + sz - 3, string(it.count));
      }
    }

    if (this.font !== -1) draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_color(color);
    draw_set_alpha(a0);
  }
};
