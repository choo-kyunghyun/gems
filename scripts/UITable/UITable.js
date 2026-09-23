/**
 * @implements {UIComponent}
 * UITable — sortable/filterable data table with row selection, sticky header, row-based
 * scroll, and keyboard/gamepad browse mode. Drawn entirely in onDraw over ONE element, so
 * re-sort/filter never reflows the layout; the element should be sized to a whole row count.
 *
 * Columns are declarative:
 *   { key?, label, width?, flex?, align?, text(row)->string, color?(row)->int,
 *     sprite?(row)->{sprite,subimg}|spriteAsset, sortable?, sortValue?(row)->num|str }
 * `width` is a column's base/min px; `flex` shares the surplus (default 0 with `width`, else 1).
 *
 * Sorting is a multi-key stack up to `sortDepth`: a clicked header becomes primary, re-clicking
 * the primary flips direction. Selection tracks the row OBJECT, so it survives re-sort/filter.
 *
 * Browse mode (entered by `navActivate`) owns the arrows: Up/Down move the row cursor,
 * Left/Right re-pick the sort column. Its key claim is re-requested every frame, so it lapses on
 * its own when the table stops updating.
 *
 * BUG: [#15549] hit-test/hover state lives in instance fields (docs/GMRT.md).
 */
globalThis.UITable = class UITable {
  constructor(t = {}) {
    this.columns = t.columns ?? [];
    this._rows = t.rows ?? [];
    this._filter = t.filter ?? null; // (row) => bool, or null for all
    this.onSelect = t.onSelect ?? noop; // (row, viewIndex)
    this.onActivate = t.onActivate ?? noop; // (row, viewIndex) — confirm in browse mode

    this.rowH = t.rowH ?? 28;
    this.headerH = t.headerH ?? 30;
    this.pad = t.pad ?? 8;
    this.cellPad = t.cellPad ?? 8;
    this.iconPad = t.iconPad ?? 4;
    this.font = t.font ?? -1;
    this.headerFont = t.headerFont ?? -1;
    this.sortDepth = t.sortDepth ?? 2;
    this.emptyText = t.emptyText ?? "";

    this.colorText = t.colorText ?? c_white;
    this.colorMuted = t.colorMuted ?? c_gray;
    this.colorHeader = t.colorHeader ?? c_ltgray;
    this.colorHeaderBg = t.colorHeaderBg ?? c_dkgray;
    this.colorRow = t.colorRow ?? c_dkgray;
    this.colorRowAlt = t.colorRowAlt ?? c_dkgray;
    this.colorRowHover = t.colorRowHover ?? c_gray;
    this.colorSel = t.colorSel ?? c_white;
    this.colorBorder = t.colorBorder ?? c_gray;
    this.colorArrow = t.colorArrow ?? c_white; // primary sort arrow + browse cursor
    this.colorArrow2 = t.colorArrow2 ?? c_gray; // secondary sort arrows
    this.rowAlpha = t.rowAlpha ?? 1;

    this._bar = new UIScrollbar(t);

    this._sort = []; // [{ ci, dir }] — primary first; dir +1 asc / -1 desc
    this._view = [];
    this._selRow = t.selected ?? null;
    this._top = 0; // first visible view index
    this._cursor = 0; // view index

    this._inside = false;
    this._hoverRow = -1;
    this._hoverCol = -1;
    this._browsing = false;
    this._mx = 0; // pointer movement hands control back to the mouse
    this._my = 0;

    if (t.sortBy != null) this._pushSort(t.sortBy, t.sortDir ?? 1);
    this._recompute();
  }

  setRows(rows) {
    this._rows = rows ?? [];
    this._recompute();
    return this;
  }
  getRows() {
    return this._rows;
  }
  getView() {
    return this._view;
  }
  getSelected() {
    return this._selRow;
  }
  setFilter(fn) {
    this._filter = fn ?? null;
    this._recompute();
    return this;
  }
  selectRow(row) {
    this._selRow = row;
    return this;
  }
  /** Swap the column set, carrying the active sort over by each column's stable `key`. */
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

  /** Make column `ci` the primary sort key; on the primary already, flip its direction. */
  sortBy(ci) {
    const col = this.columns[ci];
    if (col == null || col.sortable === false) return this;
    if (this._sort.length > 0 && this._sort[0].ci === ci) {
      this._sort[0].dir *= -1;
    } else {
      this._pushSort(ci, 1);
    }
    this._recompute();
    return this;
  }

  _pushSort(ci, dir) {
    const next = [{ ci, dir }];
    for (let i = 0; i < this._sort.length; i++) {
      if (this._sort[i].ci !== ci) next.push(this._sort[i]);
    }
    this._sort = next.slice(0, this.sortDepth);
  }

  /** 0 = primary, 1 = secondary, -1 = unsorted. */
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
    if (this._sort.length > 0) {
      // BUG: [#15593] sort indices, tie-breaking on source order.
      const order = [];
      for (let i = 0; i < v.length; i++) order.push(i);
      order.sort((a, b) => {
        const c = this._compareRows(v[a], v[b]);
        return c !== 0 ? c : a < b ? -1 : 1;
      });
      const sorted = [];
      for (let i = 0; i < order.length; i++) sorted.push(v[order[i]]);
      this._view = sorted;
    } else {
      this._view = v;
    }
  }

  _bodyRows(pos) {
    return Math.max(
      0,
      Math.floor((pos.height - this.headerH - this.pad * 2) / this.rowH),
    );
  }
  _maxTop(pos) {
    return Math.max(0, this._view.length - this._bodyRows(pos));
  }

  /**
   * Recomputed on every update and draw, never cached: a dragged window moves mid-frame, so a
   * cached geometry would draw a frame behind it.
   */
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

  /** `barOn` reserves the scrollbar gutter. */
  _columns(pos, barOn) {
    const innerW =
      pos.width - this.pad * 2 - (barOn ? this._bar.barW + this.cellPad : 0);
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

  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    const g = this._geometry(pos);
    const cols = g.cols;
    const headerTop = g.headerTop;
    const bodyTop = g.bodyTop;
    const bodyRows = g.bodyRows;
    const maxTop = g.maxTop;
    const barOn = g.barOn;
    // positive test: maxTop can be NaN for a subtree inserted mid layout pass
    this._top = maxTop > 0 ? clamp(this._top, 0, maxTop) : 0;

    const mx = Input.pointer.x;
    const my = Input.pointer.y;
    this._inside = !block && element.positionMeeting(mx, my);
    const moved = mx !== this._mx || my !== this._my;
    this._mx = mx;
    this._my = my;

    // browse mode absorbs the frame's keys (the exit Esc included, so it doesn't also
    // disengage the focus ring underneath); pointer activity hands control back to the mouse
    if (this._browsing) {
      if (moved || (this._inside && Input.pointer.left.pressed)) {
        this._browsing = false;
      } else {
        this._browseKeys(pos);
        UINav.claimKeys(this);
        return true;
      }
    }

    this._hoverRow = -1;
    this._hoverCol = -1;
    this._bar.over = false;
    if (!this._inside && !this._bar.dragging) return block;

    if (my >= headerTop && my < bodyTop) {
      for (let i = 0; i < cols.length; i++) {
        if (mx >= cols[i].x && mx < cols[i].x + cols[i].w) {
          this._hoverCol = i;
          break;
        }
      }
      if (this._hoverCol >= 0 && Input.pointer.left.pressed) this.sortBy(this._hoverCol);
    }

    const bodyH = bodyRows * this.rowH;
    if (this._inside) {
      const wheel = Input.pointer.wheel;
      if (wheel !== 0) this._top = clamp(this._top + wheel, 0, maxTop);
    }
    if (my >= bodyTop && my < bodyTop + bodyH && this._inside) {
      const r = this._top + Math.floor((my - bodyTop) / this.rowH);
      if (r >= 0 && r < this._view.length) {
        this._hoverRow = r;
        if (Input.pointer.left.pressed) {
          this._selRow = this._view[r];
          this._cursor = r;
          this.onSelect(this._selRow, r);
        }
      }
    }

    if (barOn) this._barInput(pos, mx, my, bodyTop, bodyH, maxTop);

    return this._inside || this._bar.dragging || block;
  }

  _barInput(pos, mx, my, bodyTop, bodyH, maxTop) {
    const m = this._barMetrics(pos, bodyTop, bodyH, maxTop);
    const t = this._bar.input(m, mx, my, true);
    if (t >= 0) this._top = Math.round(t * maxTop); // row-quantized
  }

  _barMetrics(pos, bodyTop, bodyH, maxTop) {
    const x = pos.left + pos.width - this.pad - this._bar.barW;
    const rowsVis = this._bodyRows(pos);
    const total = Math.max(1, this._view.length);
    return this._bar.metrics(
      x,
      bodyTop,
      bodyH,
      rowsVis,
      total,
      maxTop > 0 ? this._top / maxTop : 0,
    );
  }

  _browseKeys(pos) {
    const e = UINav.readEdge();
    if (e.cancel) {
      this._browsing = false;
      return;
    }
    const bodyRows = this._bodyRows(pos);
    const maxTop = this._maxTop(pos);
    if (this._view.length > 0) {
      if (e.dy !== 0) {
        this._cursor = clamp(this._cursor + e.dy, 0, this._view.length - 1);
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

  onDraw(element) {
    const pos = element.getLayoutPosition();
    const g = this._geometry(pos);

    const st = uiDrawSave();
    draw_set_alpha(1);

    this._drawBody(pos, g);
    this._drawHeader(pos, g);
    if (g.barOn) this._drawBar(pos, g);

    uiDrawRestore(st);
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

    const hf = resolveUIFont(this.headerFont);
    if (hf !== -1) draw_set_font(hf);
    draw_set_valign(fa_middle);
    const cy = g.headerTop + this.headerH * 0.5;
    for (let i = 0; i < this.columns.length; i++) {
      const col = this.columns[i];
      const c = cols[i];
      const rank = this._sortRank(i);
      const bright = i === this._hoverCol || rank === 0;
      draw_set_color(bright ? this.colorText : this.colorHeader);
      // labels always left-aligned so the right-edge sort arrow never collides with them
      this._cellText(col.label ?? "", c, cy, fa_left, c.w - this.cellPad - 14);
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

    const bf = resolveUIFont(this.font);
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

      let bg = vi % 2 === 0 ? this.colorRow : this.colorRowAlt;
      if (vi === this._hoverRow) bg = this.colorRowHover;
      draw_set_alpha(this.rowAlpha);
      draw_rectangle_color(x0, ry, x0 + w, ry1, bg, bg, bg, bg, false);
      draw_set_alpha(1);

      const cyr = ry + this.rowH * 0.5;
      for (let i = 0; i < this.columns.length; i++) {
        const col = this.columns[i];
        const c = cols[i];
        if (col.sprite) {
          const ic = col.sprite(row);
          const spr = ic != null && ic.sprite != null ? ic.sprite : ic;
          if (spr != null && sprite_exists(spr)) {
            const sub = (ic != null && ic.subimg) || 0;
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
          const ox = col.sprite ? this.rowH : 0;
          this._cellText(
            col.text(row),
            { x: c.x + ox, w: c.w - ox },
            cyr,
            align,
            c.w - ox - this.cellPad * 2,
          );
        }
      }

      // accent bar + outline, so the selection reads over the zebra
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
    this._bar.draw(this._barMetrics(pos, g.bodyTop, bodyH, g.maxTop));
  }

  /** Hard-truncates to `maxW` — the default font has no ellipsis glyph. */
  _cellText(str, c, cy, align, maxW) {
    draw_set_halign(align);
    let x = c.x + this.cellPad;
    if (align === fa_center) x = c.x + c.w * 0.5;
    else if (align === fa_right) x = c.x + c.w - this.cellPad;
    draw_text(x, cy, this._fit(str, maxW));
  }

  _fit(str, maxW) {
    if (maxW <= 0) return "";
    const s = string(str);
    if (string_width(s) <= maxW) return s;
    // longest fitting prefix; at least 1 char even when that still overflows
    let lo = 1;
    let hi = string_length(s) - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      if (string_width(string_copy(s, 1, mid)) <= maxW) lo = mid;
      else hi = mid - 1;
    }
    return string_copy(s, 1, lo);
  }

  // its presence marks the element focusable
  navActivate(element) {
    this._browsing = true;
    const sel = this._view.indexOf(this._selRow);
    this._cursor = sel >= 0 ? sel : this._top;
  }

  onDestroy(element) {
    UINav.releaseClaim(this);
  }
};
