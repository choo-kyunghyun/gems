/**
 * @implements {UIComponent}
 * Quest tracker — a live list bound to an injected quest source, so the widget stays
 * genre-agnostic. The source exposes `activeIds()`,
 * `def(id) → { name, objLabel, objectives:[{count}] }`, `status(id) → { ready, progress:[] }`.
 * Immediate-mode over one element, reading the source live each frame — no child rebuild — and
 * fitting the element's height to the list. A null source renders empty.
 */
globalThis.UIQuestTracker = class UIQuestTracker {
  constructor(t = {}) {
    this.source = t.source ?? null;
    // font keys resolved at draw time, not handles: a handle captured at construction goes stale
    // and renders nothing. null = inherit.
    this.titleFontKey = t.titleFontKey ?? null;
    this.bodyFontKey = t.bodyFontKey ?? null;
    this.padX = t.padX ?? 14;
    this.padY = t.padY ?? 12;
    // row heights are floors: a taller font grows its row
    this.titleH = t.titleH ?? 24;
    this.objH = t.objH ?? 20;
    this.objIndent = t.objIndent ?? 10;
    this.questGap = t.questGap ?? 10;

    this.titleColor = t.titleColor ?? c_white;
    this.readyColor = t.readyColor ?? make_colour_rgb(255, 209, 102);
    this.metColor = t.metColor ?? make_colour_rgb(84, 201, 138);
    this.pendColor = t.pendColor ?? make_colour_rgb(154, 163, 178);
    this.emptyColor = t.emptyColor ?? make_colour_rgb(154, 163, 178);
    this.emptyText = t.emptyText ?? ""; // string or () => string
    this.titleRow = this.titleH;
    this.objRow = this.objH;
  }

  _rowH(font, floor) {
    if (font === -1) return Math.max(floor, string_height("0"));
    const prev = draw_get_font();
    draw_set_font(font);
    const h = Math.max(floor, string_height("0"));
    draw_set_font(prev);
    return h;
  }

  onUpdate(element, block) {
    this.titleRow = this._rowH(this._font(this.titleFontKey), this.titleH);
    this.objRow = this._rowH(this._font(this.bodyFontKey), this.objH);
    const ids = this.source ? this.source.activeIds() : [];
    let h = this.padY * 2;
    if (ids.length === 0) h += this.objRow;
    for (let i = 0; i < ids.length; i++) {
      const def = this.source.def(ids[i]);
      h += this.titleRow + def.objectives.length * this.objRow;
      if (i < ids.length - 1) h += this.questGap;
    }
    if (element.getHeight().value != h)
      element.setHeight(h, flexpanel_unit.point);
    return block;
  }

  _font(key) {
    return key !== null ? I18n.font(key) : -1;
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();
    const st = UIDraw.save();
    draw_set_alpha(1);
    draw_set_halign(fa_left);
    draw_set_valign(fa_top);

    const x = pos.left + this.padX;
    let y = pos.top + this.padY;

    const titleFont = this._font(this.titleFontKey);
    const bodyFont = this._font(this.bodyFontKey);

    const ids = this.source ? this.source.activeIds() : [];
    if (ids.length === 0) {
      const txt =
        typeof this.emptyText === "function"
          ? this.emptyText()
          : this.emptyText;
      if (bodyFont !== -1) draw_set_font(bodyFont);
      draw_set_color(this.emptyColor);
      draw_text(x, y, txt);
    } else {
      for (let i = 0; i < ids.length; i++) {
        const def = this.source.def(ids[i]);
        const status = this.source.status(ids[i]);

        // highlighted once ready to turn in
        if (titleFont !== -1) draw_set_font(titleFont);
        draw_set_color(status.ready ? this.readyColor : this.titleColor);
        draw_text(x, y, I18n.text(def.name));
        y += this.titleRow;

        if (bodyFont !== -1) draw_set_font(bodyFont);
        const markW = 16;
        const fh = string_height("0");
        for (let o = 0; o < def.objectives.length; o++) {
          const obj = def.objectives[o];
          const prog = status.progress[o];
          const met = prog >= obj.count;
          const mcol = met ? this.metColor : this.pendColor;
          const mx = x + this.objIndent + 6;
          const my = y + fh * 0.5;
          if (met) {
            UIDraw.check(mx, my, 11, mcol);
          } else {
            draw_line_width_color(mx - 4, my, mx + 4, my, 2, mcol, mcol);
          }
          draw_set_color(mcol);
          draw_text(
            x + this.objIndent + markW,
            y,
            I18n.text(def.objLabel, prog, obj.count),
          );
          y += this.objRow;
        }
        y += this.questGap;
      }
    }

    UIDraw.restore(st);
  }
};
