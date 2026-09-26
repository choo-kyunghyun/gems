/**
 * Slot grid with hover and single selection, drawn immediate-mode across one element so a large
 * inventory stays cheap. `items` is a flat array of { sprite, subimg, count, color, borderColor?,
 * badge?, badgeColor? } or null; `borderColor` overrides the grid border per cell and `badge` is a
 * short corner marker. `sprite` must be raster (docs/GMRT.md).
 *
 * A drag onto a grid with `onDrop(source, from, to)` hands the outcome to that hook and puts the
 * carried item back, so the owner's model decides what moved; a grid without one swaps the two
 * cells. A `passive` grid only draws: it never hovers, selects or takes the pointer.
 *
 * A nav confirm enters browse mode, where the grid takes the nav's moves as a 2D slot cursor, its
 * confirm as `onActivate` on the cursor slot and its cancel as the way out; a pointer move or click
 * hands control back, and a focus that leaves the grid ends it.
 * @implements {UIComponent}
 */
globalThis.UISlots = class UISlots {
  constructor(s = {}) {
    this.items = s.items ?? []; // entry is item-or-null
    this.cols = s.cols ?? 4;
    this.cellSize = s.cellSize ?? 64;
    this.gap = s.gap ?? 8;
    this.pad = s.pad ?? 8; // icon inset inside a cell
    this.selected = s.selected ?? -1;
    this.onSelect = s.onSelect ?? noop;
    this.onActivate = s.onActivate ?? noop; // browse-mode confirm on the cursor slot
    this.draggable = s.draggable ?? false;
    this.onDrop = s.onDrop ?? null;
    this.passive = s.passive ?? false;
    this.focusable = true;
    this.font = s.font ?? -1;
    this.rad = s.rad ?? 6;

    this.slotColor = s.slotColor ?? c_dkgray;
    this.slotHover = s.slotHover ?? c_gray;
    this.borderColor = s.borderColor ?? c_gray;
    this.selectColor = s.selectColor ?? c_white;
    this.countColor = s.countColor ?? c_white;

    this._hover = -1;
    this._inside = false;
    this._browsing = false;
    this._cursor = 0;
  }

  _slotX(pos, i) {
    return pos.left + (i % this.cols) * (this.cellSize + this.gap);
  }

  _slotY(pos, i) {
    return pos.top + floor(i / this.cols) * (this.cellSize + this.gap);
  }

  /** The cell under the pointer this frame, -1 for none. */
  hovered() {
    return this._hover;
  }

  onUpdate(element, block) {
    if (this.passive) return block;
    const pos = element.getLayoutPosition();
    const mx = Input.pointer.x;
    const my = Input.pointer.y;

    // BUG: [#15549] an instance field, never a boolean local (docs/GMRT.md)
    this._inside = !block && element.positionMeeting(mx, my);

    // browse mode holds the pointer until a move or a click takes over, or the focus leaves
    if (this._browsing) {
      if (
        Input.pointer.moved ||
        UINav.focused !== element ||
        (this._inside && Input.pointer.left.pressed)
      ) {
        this._browsing = false;
      } else {
        this._hover = -1; // no stale mouse hover under the key cursor
        return true;
      }
    }

    this._hover = -1;
    if (this._inside) {
      // the cell under the pointer by division; the gap between cells hovers none
      const step = this.cellSize + this.gap;
      const lx = mx - pos.left;
      const ly = my - pos.top;
      const c = floor(lx / step);
      const r = floor(ly / step);
      const i = r * this.cols + c;
      if (
        c >= 0 &&
        c < this.cols &&
        r >= 0 &&
        i < this.items.length &&
        lx - c * step <= this.cellSize &&
        ly - r * step <= this.cellSize
      )
        this._hover = i;
    }

    if (this.draggable) {
      if (this._inside && this._hover >= 0 && Input.pointer.left.pressed) {
        if (this.items[this._hover] != null) {
          SlotDrag.begin(this, this._hover);
        } else {
          this._select(this._hover);
        }
        return true;
      }
      // the drop resolves on the last reported slot, forgiving drift on release
      if (SlotDrag.active && this._inside && this._hover >= 0) {
        SlotDrag.hover(this, this._hover);
        return true;
      }
    } else if (this._inside && this._hover >= 0 && Input.pointer.left.pressed) {
      this._select(this._hover);
      return true;
    }
    return this._inside || block;
  }

  _select(i) {
    this.selected = i;
    this.onSelect(i, this.items[i]);
  }

  /** A confirm enters browse mode, which then takes every move, confirm and cancel. */
  onNav(element, ev) {
    if (!this._browsing) {
      if (ev.kind !== "confirm") return false;
      this._browsing = true;
      this._cursor =
        this.selected >= 0 && this.selected < this.items.length
          ? this.selected
          : 0;
      return true;
    }
    if (ev.kind === "cancel") {
      this._browsing = false;
      return true;
    }
    const n = this.items.length;
    if (n === 0) return true;
    if (ev.kind === "confirm") {
      this.onActivate(this._cursor, this.items[this._cursor]);
      return true;
    }
    const c = clamp(this._cursor + ev.dx + ev.dy * this.cols, 0, n - 1);
    if (c !== this._cursor) {
      this._cursor = c;
      this._select(c);
    }
    return true;
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();
    const st = UIDraw.save();
    draw_set_alpha(1);

    const sz = this.cellSize;
    for (let i = 0; i < this.items.length; i++) {
      const x0 = this._slotX(pos, i);
      const y0 = this._slotY(pos, i);
      const x1 = x0 + sz;
      const y1 = y0 + sz;

      const bg =
        i === this._hover || (this._browsing && i === this._cursor)
          ? this.slotHover
          : this.slotColor;
      draw_roundrect_color_ext(
        x0,
        y0,
        x1,
        y1,
        this.rad,
        this.rad,
        bg,
        bg,
        false,
      );

      // a bad subimg or sprite is the caller's bug and faults loudly; a contain fit keeps a
      // non-square icon's shape
      const it = this.items[i];
      if (it != null && it.sprite != null && sprite_exists(it.sprite)) {
        const box = sz - this.pad * 2;
        const fit = UIDraw.contain(
          sprite_get_width(it.sprite),
          sprite_get_height(it.sprite),
          x0 + this.pad,
          y0 + this.pad,
          box,
          box,
        );
        draw_sprite_stretched_ext(
          it.sprite,
          it.subimg ?? 0,
          fit.x,
          fit.y,
          fit.w,
          fit.h,
          it.color ?? c_white,
          1,
        );
      }

      if (i === this.selected) {
        UIDraw.outline(x0, y0, x1, y1, this.rad, this.selectColor, 2);
      } else {
        const bc =
          it != null && it.borderColor != null
            ? it.borderColor
            : this.borderColor;
        draw_roundrect_color_ext(
          x0,
          y0,
          x1,
          y1,
          this.rad,
          this.rad,
          bc,
          bc,
          true,
        );
      }
    }

    // drawn last so the selection outline never covers them
    const fnt = UIDraw.font(this.font);
    if (fnt !== -1) draw_set_font(fnt);
    draw_set_halign(fa_right);
    draw_set_valign(fa_bottom);
    draw_set_color(this.countColor);
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it != null && it.count != null && it.count > 1) {
        draw_text(this._slotX(pos, i) + sz - 4, this._slotY(pos, i) + sz - 3, string(it.count));
      }
    }
    draw_set_halign(fa_left);
    draw_set_valign(fa_top);
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it != null && it.badge != null && it.badge !== "") {
        draw_set_color(it.badgeColor ?? this.countColor);
        draw_text(this._slotX(pos, i) + 4, this._slotY(pos, i) + 2, it.badge);
      }
    }

    UIDraw.restore(st);
  }
};
