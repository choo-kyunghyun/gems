/**
 * @implements {UIComponent}
 * Quest tracker — live list bound to an injected quest source (`t.source`, e.g. the colony's
 * `QuestLog`), so this Core widget stays genre-agnostic. The source exposes `activeIds()`,
 * `def(id) → { name, objLabel, objectives:[{count}] }`, `status(id) → { ready, progress:[] }`.
 * Drawn entirely in onDraw over one element (immediate-mode, like UISlots), reading the source
 * live each frame — no per-frame child rebuild. A null source renders empty.
 *
 * GMRT: status read live each frame (no cached primitive to clobber).
 */
globalThis.UIQuestTracker = class UIQuestTracker {
  constructor(t = {}) {
    // injected source so this Core widget doesn't reference colony-layer QuestLog; null = empty
    this.source = t.source ?? null;
    // Font KEYS (resolved via I18n.font at DRAW time), not handles: a handle captured at
    // construction freezes a stale/invalid font that renders nothing later. null = inherit.
    this.titleFontKey = t.titleFontKey ?? null;
    this.bodyFontKey = t.bodyFontKey ?? null;
    this.padX = t.padX ?? 14;
    this.padY = t.padY ?? 12;
    this.titleH = t.titleH ?? 24; // row height of a quest title
    this.objH = t.objH ?? 20; // row height of an objective line
    this.objIndent = t.objIndent ?? 10;
    this.questGap = t.questGap ?? 10; // space between quests

    this.titleColor = t.titleColor ?? c_white;
    this.readyColor = t.readyColor ?? make_colour_rgb(255, 209, 102);
    this.metColor = t.metColor ?? make_colour_rgb(84, 201, 138);
    this.pendColor = t.pendColor ?? make_colour_rgb(154, 163, 178);
    this.emptyColor = t.emptyColor ?? make_colour_rgb(154, 163, 178);
    this.emptyText = t.emptyText ?? ""; // string or () => string
  }

  /** Total pixel height of all active quests — the factory sizes the element to this for UIScroll overflow. */
  contentHeight() {
    const ids = this.source ? this.source.activeIds() : [];
    if (ids.length === 0) return this.padY * 2 + this.objH;
    let h = this.padY * 2;
    for (let i = 0; i < ids.length; i++) {
      const def = this.source.def(ids[i]);
      h += this.titleH + def.objectives.length * this.objH;
      if (i < ids.length - 1) h += this.questGap;
    }
    return h;
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();
    const st = uiDrawSave();
    draw_set_alpha(1);
    draw_set_halign(fa_left);
    draw_set_valign(fa_top);

    const x = pos.left + this.padX;
    let y = pos.top + this.padY;

    const titleFont =
      this.titleFontKey !== null ? I18n.font(this.titleFontKey) : -1;
    const bodyFont =
      this.bodyFontKey !== null ? I18n.font(this.bodyFontKey) : -1;

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

        // title — gold once ready to turn in
        if (titleFont !== -1) draw_set_font(titleFont);
        draw_set_color(status.ready ? this.readyColor : this.titleColor);
        draw_text(x, y, I18n.text(def.name));
        y += this.titleH;

        // one line per objective: marker (check when met, dash when pending) + label, lime when met
        if (bodyFont !== -1) draw_set_font(bodyFont);
        const markW = 16; // marker column width before the label
        const fh = string_height("0"); // body line height, to center the marker
        for (let o = 0; o < def.objectives.length; o++) {
          const obj = def.objectives[o];
          const prog = status.progress[o];
          const met = prog >= obj.count;
          const mcol = met ? this.metColor : this.pendColor;
          const mx = x + this.objIndent + 6;
          const my = y + fh * 0.5;
          if (met) {
            drawUICheck(mx, my, 11, mcol);
          } else {
            draw_line_width_color(mx - 4, my, mx + 4, my, 2, mcol, mcol);
          }
          draw_set_color(mcol);
          draw_text(
            x + this.objIndent + markW,
            y,
            I18n.text(def.objLabel, prog, obj.count),
          );
          y += this.objH;
        }
        y += this.questGap;
      }
    }

    uiDrawRestore(st);
  }
};
