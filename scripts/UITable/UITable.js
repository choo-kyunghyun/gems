/**
 * @implements {UIComponent}
 * UITable — sortable/filterable data table with row selection, sticky header, row-based
 * scroll, and keyboard/gamepad browse mode. Drawn entirely in onDraw over ONE element
 * (like UISlots), so re-sort/filter never reflows the layout. The element is FIXED-height
 * to a whole row count (gemsTable does this), so the body shows full rows, no surface.
 *
 * Columns are declarative:
 *   { label, width?, flex?, align?, text(row)->string, color?(row)->int,
 *     sprite?(row)->{sprite,subimg}|spriteAsset, sortable?, sortValue?(row)->num|str }
 * `width` is a column's base/min px; `flex` shares the surplus so columns grow when the
 * table is wider than its content (default flex: 0 with `width`, else 1 = fill column).
 *
 * Sorting is a multi-key STACK: clicking a header makes it primary (demoting the old
 * primary, up to `sortDepth`); re-clicking the primary flips direction. Filtering is an
 * external predicate (`setFilter`). Selection tracks the row OBJECT (survives re-sort/filter).
 *
 * Browse mode: `navActivate` enters it; the table then owns the arrows (Up/Down row cursor,
 * Left/Right re-pick the sort column). It claims keys by setting `UITable.active = this` each
 * frame; UINav consumes the flag — a per-frame REQUEST, so if the table stops updating the
 * claim lapses and nav resumes.
 *
 * GMRT: hit-test/hover live in instance fields (cached primitive bool gets clobbered — see
 * CLAUDE.md); no Map/Set iteration; pointer edges via UIPointer (frame-latched), never a
 * re-read of mouse_check_button*.
 */
globalThis.UITable = class UITable {
  // table requesting keyboard browse this frame (UINav.consume reads + clears it).
  // A plain static field, not a static getter (GMRT doesn't fire those).
  static active = null;

  // UINav.update: if a table claimed the keys this frame, suspend nav and clear the claim.
  /** @returns {boolean} whether a table is requesting keyboard browse this frame */
  static consume() {
    if (UITable.active === null) return false;
    UITable.active = null;
    return true;
  }

  constructor(t = {}) {
    this.columns = t.columns ?? [];
    this._rows = t.rows ?? [];
    this._filter = t.filter ?? null; // (row) => bool, or null for all
    this.onSelect = t.onSelect ?? noop; // (row, viewIndex)
    this.onActivate = t.onActivate ?? noop; // (row, viewIndex) — confirm/double-click

    this.rowH = t.rowH ?? 28;
    this.headerH = t.headerH ?? 30;
    this.pad = t.pad ?? 8; // inset around the whole table
    this.cellPad = t.cellPad ?? 8; // text inset inside a cell
    this.iconPad = t.iconPad ?? 4; // icon inset inside an icon cell
    this.font = t.font ?? -1;
    this.headerFont = t.headerFont ?? -1;
    this.sortDepth = t.sortDepth ?? 2;
    this.emptyText = t.emptyText ?? "";

    this.colorText = t.colorText ?? c_white;
    this.colorMuted = t.colorMuted ?? c_gray;
    this.colorHeader = t.colorHeader ?? c_ltgray;
    this.colorHeaderBg = t.colorHeaderBg ?? c_dkgray;
    this.colorRow = t.colorRow ?? c_dkgray;
    this.colorRowAlt = t.colorRowAlt ?? c_dkgray; // zebra stripe
    this.colorRowHover = t.colorRowHover ?? c_gray;
    this.colorSel = t.colorSel ?? c_white; // selected-row accent
    this.colorBorder = t.colorBorder ?? c_gray;
    this.colorArrow = t.colorArrow ?? c_white; // primary sort arrow
    this.colorArrow2 = t.colorArrow2 ?? c_gray; // secondary sort arrows
    this.rowAlpha = t.rowAlpha ?? 1;

    this.barW = t.barW ?? 8;
    this.trackColor = t.trackColor ?? c_black;
    this.thumbColor = t.thumbColor ?? c_gray;
    this.thumbHover = t.thumbHover ?? c_ltgray;
    this.minThumb = t.minThumb ?? 24;

    this._sort = []; // [{ ci, dir }] — primary first; dir +1 asc / -1 desc
    this._view = []; // filtered + sorted row refs
    this._selRow = t.selected ?? null; // selected row OBJECT
    this._top = 0; // first visible row index
    this._cursor = 0; // keyboard cursor (view index)

    this._inside = false;
    this._hoverRow = -1; // view index under pointer
    this._hoverCol = -1; // header column under pointer
    this._browsing = false; // keyboard browse mode latched
    this._mx = 0; // last pointer pos — movement hands control back to mouse
    this._my = 0;
    this._barDrag = false;
    this._barDY = 0;
    this._overThumb = false;

    if (t.sortBy != null) this._pushSort(t.sortBy, t.sortDir ?? 1);
    this._recompute();
  }

  // ── public API ──────────────────────────────────────────────
  /** Replace the source rows (re-applies filter + sort). @param {Object[]} rows @returns {UITable} */
  setRows(rows) {
    this._rows = rows ?? [];
    this._recompute();
    return this;
  }
  // Methods, NOT instance getters — house style; the old "getter shadowing a GML name
  // faults" report was dismissed (2026-07 re-audit).
  /** @returns {Object[]} the source rows */
  getRows() {
    return this._rows;
  }
  /** @returns {Object[]} the filtered + sorted view rows */
  getView() {
    return this._view;
  }
  /** @returns {Object|null} the selected row object */
  getSelected() {
    return this._selRow;
  }
  /** Set the row-filter predicate (or null for all). @param {((row:Object)=>boolean)|null} fn @returns {UITable} */
  setFilter(fn) {
    this._filter = fn ?? null;
    this._recompute();
    return this;
  }
  /** @param {Object|null} row @returns {UITable} */
  selectRow(row) {
    this._selRow = row;
    return this;
  }
  // The sort stack stores column INDICES, which shift when columns change — so remap by each
  // sorted column's `key`, dropping any whose column is gone (or has no `key`).
  /** Swap the column set, remapping the active sort by each column's stable `key`. @param {Object[]} columns @returns {UITable} */
  setColumns(columns) {
    const keys = [];
    for (let i = 0; i < this._sort.length; i++) {
      const col = this.columns[this._sort[i].ci];
      keys.push(col != null ? col.key : null);
    }
    this.columns = columns ?? [];
    const next = [];
    for (let i = 0; i < keys.length; i++) {
      if (keys[i] == null) continue;
      const ci = this._colIndex(keys[i]);
      if (ci >= 0) next.push({ ci, dir: this._sort[i].dir });
    }
    this._sort = next;
    this._recompute();
    return this;
  }
  _colIndex(key) {
    for (let i = 0; i < this.columns.length; i++) {
      if (this.columns[i].key === key) return i;
    }
    return -1;
  }

  // ── sorting ─────────────────────────────────────────────────
  /** Make column `ci` the primary sort key (re-click flips direction). @param {number} ci @returns {UITable} */
  sortBy(ci) {
    const col = this.columns[ci];
    if (col == null || col.sortable === false) return this;
    if (this._sort.length > 0 && this._sort[0].ci === ci) {
      this._sort[0].dir *= -1; // re-click primary → flip direction
    } else {
      this._pushSort(ci, 1);
    }
    this._recompute();
    return this;
  }

  _pushSort(ci, dir) {
    const next = [{ ci, dir }];
    for (let i = 0; i < this._sort.length; i++) {
      if (this._sort[i].ci !== ci) next.push(this._sort[i]); // keep others as tiebreaks
    }
    this._sort = next.slice(0, this.sortDepth);
  }

  // Rank of column ci in the sort stack: 0 = primary, 1 = secondary, -1 = unsorted.
  _sortRank(ci) {
    for (let i = 0; i < this._sort.length; i++) {
      if (this._sort[i].ci === ci) return i;
    }
    return -1;
  }

  _sortVal(col, row) {
    if (col.sortValue) return col.sortValue(row);
    if (col.text) return col.text(row);
    return "";
  }

  _compareRows(a, b) {
    for (let s = 0; s < this._sort.length; s++) {
      const key = this._sort[s];
      const col = this.columns[key.ci];
      const va = this._sortVal(col, a);
      const vb = this._sortVal(col, b);
      let c = 0;
      if (va < vb) c = -1;
      else if (va > vb) c = 1;
      if (c !== 0) return c * key.dir;
    }
    return 0;
  }

  _recompute() {
    const src = this._rows;
    const v = [];
    for (let i = 0; i < src.length; i++) {
      if (this._filter === null || this._filter(src[i])) v.push(src[i]);
    }
    if (this._sort.length > 0) v.sort((a, b) => this._compareRows(a, b));
    this._view = v;
  }

  // ── geometry ────────────────────────────────────────────────
  _bodyRows(pos) {
    return Math.max(
      0,
      Math.floor((pos.height - this.headerH - this.pad * 2) / this.rowH),
    );
  }
  _maxTop(pos) {
    return Math.max(0, this._view.length - this._bodyRows(pos));
  }

  // Recomputed fresh each onUpdate AND onDraw (not cached between): a dragged window's
  // dragX/dragY changes mid-frame, so a cached geometry would draw a frame behind the panel.
  _geometry(pos) {
    const bodyRows = this._bodyRows(pos);
    const barOn = this._view.length > bodyRows;
    return {
      cols: this._columns(pos, barOn),
      headerTop: pos.top + this.pad,
      bodyTop: pos.top + this.pad + this.headerH,
      bodyRows,
      maxTop: this._maxTop(pos),
      barOn,
    };
  }

  // Column pixel layout. `width` is each column's base/min px; `flex` shares the surplus so
  // columns grow as the table widens (default flex 0 with `width`, else 1 = fill column).
  // `barOn` reserves the scrollbar gutter.
  _columns(pos, barOn) {
    const innerW =
      pos.width - this.pad * 2 - (barOn ? this.barW + this.cellPad : 0);
    let base = 0;
    let totalFlex = 0;
    for (let i = 0; i < this.columns.length; i++) {
      const col = this.columns[i];
      base += col.width ?? 0;
      totalFlex += col.flex ?? (col.width != null ? 0 : 1);
    }
    const surplus = Math.max(0, innerW - base);
    let x = pos.left + this.pad;
    const out = [];
    for (let i = 0; i < this.columns.length; i++) {
      const col = this.columns[i];
      const weight = col.flex ?? (col.width != null ? 0 : 1);
      const w =
        (col.width ?? 0) + (totalFlex > 0 ? (surplus * weight) / totalFlex : 0);
      out.push({ x, w });
      x += w;
    }
    return out;
  }

  // ── update ──────────────────────────────────────────────────
  /** @param {UIElement} element @param {boolean} block @returns {boolean} whether the pointer is captured */
  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return block; // unlaid-out (NaN) width — NaN <= 0 is false

    const g = this._geometry(pos);
    const cols = g.cols;
    const headerTop = g.headerTop;
    const bodyTop = g.bodyTop;
    const bodyRows = g.bodyRows;
    const maxTop = g.maxTop;
    const barOn = g.barOn;
    this._top = clamp(this._top, 0, maxTop);

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    this._inside = !block && element.positionMeeting(mx, my);
    const moved = mx !== this._mx || my !== this._my;
    this._mx = mx;
    this._my = my;

    // browse mode owns input while latched; a pointer move/click hands control back to mouse.
    // it re-requests nav suspension each frame and absorbs that frame's keys (incl. the exit
    // Esc, so Esc doesn't also disengage the focus ring underneath).
    if (this._browsing) {
      if (moved || (this._inside && UIPointer.pressed)) {
        this._browsing = false; // pointer takes over → fall through to mouse handling
      } else {
        this._browseKeys(pos);
        UITable.active = this; // re-request nav suspension THIS frame (self-healing)
        return true;
      }
    }

    this._hoverRow = -1;
    this._hoverCol = -1;
    this._overThumb = false;
    if (!this._inside && !this._barDrag) return block;

    // Header: hover + click-to-sort.
    if (my >= headerTop && my < bodyTop) {
      for (let i = 0; i < cols.length; i++) {
        if (mx >= cols[i].x && mx < cols[i].x + cols[i].w) {
          this._hoverCol = i;
          break;
        }
      }
      if (this._hoverCol >= 0 && UIPointer.pressed) this.sortBy(this._hoverCol);
    }

    // Body: wheel scroll, row hover + click-to-select.
    const bodyH = bodyRows * this.rowH;
    if (this._inside) {
      const wheel = UIPointer.wheel;
      if (wheel !== 0) this._top = clamp(this._top + wheel, 0, maxTop);
    }
    if (my >= bodyTop && my < bodyTop + bodyH && this._inside) {
      const r = this._top + Math.floor((my - bodyTop) / this.rowH);
      if (r >= 0 && r < this._view.length) {
        this._hoverRow = r;
        if (UIPointer.pressed) {
          this._selRow = this._view[r];
          this._cursor = r;
          this.onSelect(this._selRow, r);
        }
      }
    }

    // Scrollbar drag (row-based thumb).
    if (barOn) this._barInput(pos, mx, my, bodyTop, bodyH, maxTop);

    return this._inside || this._barDrag || block;
  }

  _barInput(pos, mx, my, bodyTop, bodyH, maxTop) {
    const m = this._barMetrics(pos, bodyTop, bodyH, maxTop);
    this._overThumb =
      !this._barDrag &&
      mx >= m.x &&
      mx <= m.x + this.barW &&
      my >= m.thumbY &&
      my <= m.thumbY + m.thumbH;
    if (this._overThumb && UIPointer.pressed) {
      this._barDrag = true;
      this._barDY = my - m.thumbY;
    }
    if (this._barDrag) {
      if (UIPointer.down) {
        const travel = m.h - m.thumbH;
        const t = travel > 0 ? (my - this._barDY - m.y) / travel : 0;
        this._top = Math.round(clamp(t, 0, 1) * maxTop);
      } else {
        this._barDrag = false;
      }
    }
  }

  _barMetrics(pos, bodyTop, bodyH, maxTop) {
    const x = pos.left + pos.width - this.pad - this.barW;
    const y = bodyTop;
    const h = bodyH;
    const rowsVis = this._bodyRows(pos);
    const total = Math.max(1, this._view.length);
    const thumbH = clamp((rowsVis / total) * h, this.minThumb, h);
    const t = maxTop > 0 ? this._top / maxTop : 0;
    const thumbY = y + t * (h - thumbH);
    return { x, y, h, thumbH, thumbY };
  }

  _browseKeys(pos) {
    const e = this._navEdge();
    if (e.cancel) {
      this._browsing = false;
      return;
    }
    const bodyRows = this._bodyRows(pos);
    const maxTop = this._maxTop(pos);
    if (this._view.length > 0) {
      if (e.dy !== 0) {
        this._cursor = clamp(this._cursor + e.dy, 0, this._view.length - 1);
        // Scroll-follow: keep the cursor inside the window.
        if (this._cursor < this._top) this._top = this._cursor;
        else if (this._cursor >= this._top + bodyRows)
          this._top = this._cursor - bodyRows + 1;
        this._top = clamp(this._top, 0, maxTop);
        this._selRow = this._view[this._cursor];
        this.onSelect(this._selRow, this._cursor);
      }
      if (e.confirm) this.onActivate(this._view[this._cursor], this._cursor);
    }
    if (e.dx !== 0) this._cycleSort(e.dx);
  }

  // Move the primary sort to the next sortable column in direction dir.
  _cycleSort(dir) {
    const n = this.columns.length;
    if (n === 0) return;
    let start = this._sort.length > 0 ? this._sort[0].ci : dir > 0 ? -1 : n;
    for (let step = 0; step < n; step++) {
      start = (start + dir + n) % n;
      if (this.columns[start].sortable !== false) {
        this.sortBy(start);
        return;
      }
    }
  }

  // Minimal directional edge read for browse mode (keyboard + gamepad dpad). The full
  // stick/analog handling lives in UINav; the table only needs discrete steps.
  _navEdge() {
    let dx = 0;
    let dy = 0;
    let confirm = false;
    let cancel = false;
    if (keyboard_check_pressed(vk_left)) dx = -1;
    else if (keyboard_check_pressed(vk_right)) dx = 1;
    if (keyboard_check_pressed(vk_up)) dy = -1;
    else if (keyboard_check_pressed(vk_down)) dy = 1;
    if (keyboard_check_pressed(vk_enter) || keyboard_check_pressed(vk_space))
      confirm = true;
    if (keyboard_check_pressed(vk_escape)) cancel = true;
    if (gamepad_is_connected(0)) {
      if (gamepad_button_check_pressed(0, gp_padl)) dx = -1;
      else if (gamepad_button_check_pressed(0, gp_padr)) dx = 1;
      if (gamepad_button_check_pressed(0, gp_padu)) dy = -1;
      else if (gamepad_button_check_pressed(0, gp_padd)) dy = 1;
      if (gamepad_button_check_pressed(0, gp_face1)) confirm = true;
      if (gamepad_button_check_pressed(0, gp_face2)) cancel = true;
    }
    return { dx, dy, confirm, cancel };
  }

  // ── draw ────────────────────────────────────────────────────
  /** @param {UIElement} element */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return; // unlaid-out (NaN) width — NaN <= 0 is false
    const g = this._geometry(pos); // live geometry — stays glued to a dragged window

    const font = draw_get_font();
    const halign = draw_get_halign();
    const valign = draw_get_valign();
    const color = draw_get_color();
    const a0 = draw_get_alpha();
    draw_set_alpha(1);

    this._drawBody(pos, g);
    this._drawHeader(pos, g);
    if (g.barOn) this._drawBar(pos, g);

    draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_color(color);
    draw_set_alpha(a0);
  }

  _drawHeader(pos, g) {
    const cols = g.cols;
    const x0 = pos.left + this.pad;
    const w = pos.width - this.pad * 2;
    draw_set_alpha(1);
    draw_rectangle_color(
      x0,
      g.headerTop,
      x0 + w,
      g.headerTop + this.headerH,
      this.colorHeaderBg,
      this.colorHeaderBg,
      this.colorHeaderBg,
      this.colorHeaderBg,
      false,
    );
    draw_rectangle_color(
      x0,
      g.headerTop + this.headerH - 1,
      x0 + w,
      g.headerTop + this.headerH,
      this.colorBorder,
      this.colorBorder,
      this.colorBorder,
      this.colorBorder,
      false,
    );

    // resolve I18n font KEY live (survives a locale reload); a raw handle passes through
    const hf =
      typeof this.headerFont === "string"
        ? I18n.font(this.headerFont)
        : this.headerFont;
    if (hf !== -1) draw_set_font(hf);
    draw_set_valign(fa_middle);
    const cy = g.headerTop + this.headerH * 0.5;
    for (let i = 0; i < this.columns.length; i++) {
      const col = this.columns[i];
      const c = cols[i];
      const rank = this._sortRank(i);
      const bright = i === this._hoverCol || rank === 0;
      draw_set_color(bright ? this.colorText : this.colorHeader);
      // labels always left-aligned so the right-edge sort arrow never collides/truncates them
      this._cellText(col.label ?? "", c, cy, fa_left, c.w - this.cellPad - 14);
      // sort arrow at the right edge: up asc / down desc, accent on primary
      if (rank >= 0) {
        const dir = this._sort[rank].dir;
        const ah = 4;
        drawUIArrow(
          c.x + c.w - this.cellPad - ah,
          cy,
          dir > 0 ? "up" : "down",
          ah,
          rank === 0 ? this.colorArrow : this.colorArrow2,
        );
      }
    }
  }

  _drawBody(pos, g) {
    const cols = g.cols;
    const x0 = pos.left + this.pad;
    const w = pos.width - this.pad * 2;
    const bodyH = g.bodyRows * this.rowH;

    // resolve I18n font KEY live (survives a locale reload); a raw handle passes through
    const bf = typeof this.font === "string" ? I18n.font(this.font) : this.font;
    if (bf !== -1) draw_set_font(bf);
    draw_set_valign(fa_middle);

    if (this._view.length === 0 && this.emptyText !== "") {
      draw_set_color(this.colorMuted);
      draw_set_halign(fa_center);
      draw_set_valign(fa_middle);
      draw_text(x0 + w * 0.5, g.bodyTop + bodyH * 0.5, this.emptyText);
      return;
    }

    for (let r = 0; r < g.bodyRows; r++) {
      const vi = this._top + r;
      if (vi >= this._view.length) break;
      const row = this._view[vi];
      const ry = g.bodyTop + r * this.rowH;
      const ry1 = ry + this.rowH;

      // Row background: zebra, then hover, then selection tint.
      let bg = vi % 2 === 0 ? this.colorRow : this.colorRowAlt;
      if (vi === this._hoverRow) bg = this.colorRowHover;
      draw_set_alpha(this.rowAlpha);
      draw_rectangle_color(x0, ry, x0 + w, ry1, bg, bg, bg, bg, false);
      draw_set_alpha(1);

      // Cells.
      const cyr = ry + this.rowH * 0.5;
      for (let i = 0; i < this.columns.length; i++) {
        const col = this.columns[i];
        const c = cols[i];
        if (col.sprite) {
          const ic = col.sprite(row);
          const spr = ic != null && ic.sprite != null ? ic.sprite : ic;
          if (spr != null && sprite_exists(spr)) {
            const n = max(1, sprite_get_number(spr));
            const sub = clamp((ic != null && ic.subimg) || 0, 0, n - 1);
            const s = this.rowH - this.iconPad * 2;
            draw_sprite_stretched_ext(
              spr,
              sub,
              c.x + this.cellPad,
              ry + this.iconPad,
              s,
              s,
              c_white,
              1,
            );
          }
        }
        if (col.text) {
          draw_set_color(col.color ? col.color(row) : this.colorText);
          const align = col.align ?? fa_left;
          const ox = col.sprite ? this.rowH : 0; // shift past an icon in the same cell
          this._cellText(
            col.text(row),
            { x: c.x + ox, w: c.w - ox },
            cyr,
            align,
            c.w - ox - this.cellPad * 2,
          );
        }
      }

      // Selection: a left accent bar + outline so it reads over the zebra.
      if (row === this._selRow) {
        draw_rectangle_color(
          x0,
          ry,
          x0 + 3,
          ry1,
          this.colorSel,
          this.colorSel,
          this.colorSel,
          this.colorSel,
          false,
        );
        draw_rectangle_color(
          x0,
          ry,
          x0 + w,
          ry1,
          this.colorSel,
          this.colorSel,
          this.colorSel,
          this.colorSel,
          true,
        );
      }
      // Keyboard cursor: a brighter outline while browsing.
      if (this._browsing && vi === this._cursor) {
        draw_rectangle_color(
          x0,
          ry,
          x0 + w,
          ry1,
          this.colorArrow,
          this.colorArrow,
          this.colorArrow,
          this.colorArrow,
          true,
        );
      }
    }
  }

  _drawBar(pos, g) {
    const bodyH = g.bodyRows * this.rowH;
    const m = this._barMetrics(pos, g.bodyTop, bodyH, g.maxTop);
    const rad = this.barW * 0.5;
    draw_set_alpha(0.25);
    draw_roundrect_color_ext(
      m.x,
      m.y,
      m.x + this.barW,
      m.y + m.h,
      rad,
      rad,
      this.trackColor,
      this.trackColor,
      false,
    );
    draw_set_alpha(1);
    const col =
      this._overThumb || this._barDrag ? this.thumbHover : this.thumbColor;
    draw_roundrect_color_ext(
      m.x,
      m.thumbY,
      m.x + this.barW,
      m.thumbY + m.thumbH,
      rad,
      rad,
      col,
      col,
      false,
    );
  }

  // cell text fit to `maxW` (hard-truncate — the default font has no ellipsis glyph)
  _cellText(str, c, cy, align, maxW) {
    draw_set_halign(align);
    let x = c.x + this.cellPad;
    if (align === fa_center) x = c.x + c.w * 0.5;
    else if (align === fa_right) x = c.x + c.w - this.cellPad;
    draw_text(x, cy, this._fit(str, maxW));
  }

  _fit(str, maxW) {
    if (maxW <= 0) return "";
    let s = string(str);
    if (string_width(s) <= maxW) return s;
    while (string_length(s) > 1 && string_width(s) > maxW) {
      s = string_copy(s, 1, string_length(s) - 1);
    }
    return s;
  }

  // ── nav ─────────────────────────────────────────────────────
  // confirm enters browse mode; its presence marks the element focusable
  /** @param {UIElement} element */
  navActivate(element) {
    this._browsing = true;
    // seed cursor on the selected row, else top of window
    const sel = this._view.indexOf(this._selRow);
    this._cursor = sel >= 0 ? sel : this._top;
  }

  /** Release the browse-mode key claim on teardown. @param {UIElement} element */
  onDestroy(element) {
    if (UITable.active === this) UITable.active = null;
  }
};
