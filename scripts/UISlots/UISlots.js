/**
 * @implements {UIComponent}
 * Slot grid with hover + single selection (inventory foundation) — lives on a
 * fixed-size element (built by gemsSlots, which sizes the element to exactly the
 * grid so the slots align with the element rect and a UIScroll can measure it). The
 * whole grid is drawn directly in onDraw across one element (like UISelect/UITabs,
 * no child-per-slot), so a large inventory is cheap.
 *
 * `items` is a flat array of slot data or null (empty slot). A slot item is
 * { sprite, subimg, count, color } — `sprite` MUST be a raster sprite (SVG sprites
 * report 0 frames on GMRT and faulting draw_sprite; see CLAUDE.md). Click selects a
 * slot and fires onSelect(index, item).
 *
 * GMRT note: hover/selection are read live from the pointer each frame (no cached
 * primitive bool to be clobbered) and there is no timer (no Time.raw/delta).
 */
globalThis.UISlots = class UISlots {
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
  }

  // Top-left of slot i, in gui space, relative to the element's laid-out rect.
  _slotXY(pos, i) {
    const step = this.cellSize + this.gap;
    return {
      x: pos.left + (i % this.cols) * step,
      y: pos.top + floor(i / this.cols) * step,
    };
  }

  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return block; // unlaid-out (NaN) or zero-width

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    const inside = !block && element.positionMeeting(mx, my);

    this._hover = -1;
    if (inside) {
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
      // Press a filled slot → pick it up; press an empty slot → just select it.
      if (inside && this._hover >= 0 && mouse_check_button_pressed(mb_left)) {
        if (this.items[this._hover] != null) {
          SlotDrag.begin(this, this._hover);
        } else {
          this._select(this._hover);
        }
        return true;
      }
      // Release over a slot of this grid → drop. Dropping back onto the source
      // slot (no move) reads as a plain click → select it.
      if (
        inside &&
        this._hover >= 0 &&
        mouse_check_button_released(mb_left) &&
        SlotDrag.active
      ) {
        const onSource =
          SlotDrag.source === this && SlotDrag.sourceIndex === this._hover;
        SlotDrag.drop(this, this._hover);
        if (onSource) this._select(this._hover);
        return true;
      }
    } else if (
      inside &&
      this._hover >= 0 &&
      mouse_check_button_pressed(mb_left)
    ) {
      this._select(this._hover);
      return true;
    }
    return inside || block;
  }

  _select(i) {
    this.selected = i;
    this.onSelect(i, this.items[i]);
  }

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

      // Cell background.
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

      // Icon (raster only).
      const it = this.items[i];
      if (it != null && it.sprite != null && sprite_exists(it.sprite)) {
        const n = max(1, sprite_get_number(it.sprite));
        const sub = clamp(it.subimg ?? 0, 0, n - 1);
        draw_sprite_stretched_ext(
          it.sprite,
          sub,
          p.x + this.pad,
          p.y + this.pad,
          sz - this.pad * 2,
          sz - this.pad * 2,
          it.color ?? c_white,
          1,
        );
      }

      // Selection: a 2px accent outline. Else a 1px border.
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

    // Stack counts on top so the selection outline never covers them.
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
