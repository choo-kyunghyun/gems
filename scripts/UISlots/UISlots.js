/**
 * @implements {UIComponent}
 * Slot grid with hover + single selection (inventory foundation). Whole grid drawn
 * immediate-mode across one element (no child-per-slot), so a large inventory is cheap.
 * `items` is a flat array of { sprite, subimg, count, color, borderColor?, badge?, badgeColor? }
 * or null — `borderColor` overrides the grid border per cell (rarity tint), `badge` is a short
 * corner marker ("E"/"*"). `sprite` MUST be raster — SVG sprites report 0 frames + fault
 * draw_sprite on GMRT (see CLAUDE.md).
 *
 * Browse mode: `navActivate` enters it; the grid then owns the arrows (a 2D slot cursor,
 * confirm → onActivate). It claims the keys via `UINav.claimKeys(this)` each frame — a
 * per-frame REQUEST UINav consumes, so a stale claim lapses (same contract as UITable).
 * Edge reads come from the shared `UINav.readEdge()`.
 *
 * GMRT: hover/selection read live each frame (no cached primitive bool to clobber).
 */
globalThis.UISlots = class UISlots {
  /** @param {Object} [s] { items, cols, cellSize, gap, pad, selected, onSelect, onActivate, draggable, font, rad, slotColor, slotHover, borderColor, selectColor, countColor } */
  constructor(s = {}) {
    this.items = s.items ?? []; // flat array; entry is item-or-null
    this.cols = s.cols ?? 4;
    this.cellSize = s.cellSize ?? 64;
    this.gap = s.gap ?? 8;
    this.pad = s.pad ?? 8; // icon inset inside a cell
    this.selected = s.selected ?? -1;
    this.onSelect = s.onSelect ?? noop;
    this.onActivate = s.onActivate ?? noop; // browse-mode confirm on the cursor slot
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
    this._browsing = false; // keyboard/gamepad browse mode (navActivate enters)
    this._cursor = 0; // browse-mode slot cursor
    this._mx = -1; // last pointer position — a move hands browse back to the mouse
    this._my = -1;
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
    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);

    // hit-test into INSTANCE fields, not boolean local consts — on GMRT a local bool
    // can flip true→false mid-function (see CLAUDE.md), gating the hover branch wrongly.
    this._inside = !block && element.positionMeeting(mx, my);
    const moved = mx !== this._mx || my !== this._my;
    this._mx = mx;
    this._my = my;

    // browse mode owns input while latched; a pointer move/click hands control back to the
    // mouse. Re-requests nav suspension each frame and absorbs that frame's keys (incl. the
    // exit Esc) — same contract as UITable browse mode.
    if (this._browsing) {
      if (moved || (this._inside && UIPointer.pressed)) {
        this._browsing = false; // pointer takes over → fall through to mouse handling
      } else {
        this._hover = -1; // no stale mouse hover under the key cursor
        this._browseKeys();
        UINav.claimKeys(this); // re-request nav suspension THIS frame (self-healing)
        return true;
      }
    }

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

  // ── nav ─────────────────────────────────────────────────────
  // confirm enters browse mode; its presence marks the element focusable (UINav duck-typing)
  /** @param {UIElement} element */
  navActivate(element) {
    this._browsing = true;
    // seed the cursor on the current selection, else the first slot
    this._cursor =
      this.selected >= 0 && this.selected < this.items.length
        ? this.selected
        : 0;
  }

  _browseKeys() {
    const e = UINav.readEdge();
    if (e.cancel) {
      this._browsing = false;
      return;
    }
    const n = this.items.length;
    if (n === 0) return;
    if (e.dx !== 0 || e.dy !== 0) {
      const c = clamp(this._cursor + e.dx + e.dy * this.cols, 0, n - 1);
      if (c !== this._cursor) {
        this._cursor = c;
        this._select(c);
      }
    }
    if (e.confirm) this.onActivate(this._cursor, this.items[this._cursor]);
  }

  /** Release the browse-mode key claim on teardown. @param {UIElement} element */
  onDestroy(element) {
    UINav.releaseClaim(this);
  }

  /** @param {UIElement} element */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    const st = uiDrawSave();
    draw_set_alpha(1);

    const sz = this.cellSize;
    for (let i = 0; i < this.items.length; i++) {
      const p = this._slotXY(pos, i);
      const x1 = p.x + sz;
      const y1 = p.y + sz;

      // cell background (the browse cursor highlights like a hover).
      const bg =
        i === this._hover || (this._browsing && i === this._cursor)
          ? this.slotHover
          : this.slotColor;
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

      // icon (raster only — an invalid subimg or SVG sprite is the caller's bug and faults
      // loudly rather than being clamped away). Aspect-preserving fit inside the cell's inner
      // box: a non-square icon (wide gun / tall item) keeps its shape instead of being squished
      // into a square. stretched_ext fills the given rect ignoring origin, so center by offset.
      const it = this.items[i];
      if (it != null && it.sprite != null && sprite_exists(it.sprite)) {
        const sub = it.subimg ?? 0;
        const box = sz - this.pad * 2;
        const sw = sprite_get_width(it.sprite);
        const sh = sprite_get_height(it.sprite);
        const fit = min(box / sw, box / sh);
        const dw = sw * fit;
        const dh = sh * fit;
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
        // per-item border (rarity tint) wins over the grid default
        const bc =
          it != null && it.borderColor != null
            ? it.borderColor
            : this.borderColor;
        draw_roundrect_color_ext(
          p.x,
          p.y,
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

    // counts + corner badges drawn last so the selection outline never covers them.
    const fnt = resolveUIFont(this.font);
    if (fnt !== -1) draw_set_font(fnt);
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
    draw_set_halign(fa_left);
    draw_set_valign(fa_top);
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      if (it != null && it.badge != null && it.badge !== "") {
        const p = this._slotXY(pos, i);
        draw_set_color(it.badgeColor ?? this.countColor);
        draw_text(p.x + 4, p.y + 2, it.badge);
      }
    }

    uiDrawRestore(st);
  }
};
