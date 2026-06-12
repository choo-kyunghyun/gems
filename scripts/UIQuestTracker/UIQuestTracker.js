/**
 * @implements {UIComponent}
 * Quest tracker — a live, on-screen list bound to the global QuestLog. Lives on a
 * fixed-size element (built by gemsQuestTracker, which sizes the element to the active
 * quests so an enclosing UIScroll can measure + reveal overflow). The whole list is
 * drawn directly in onDraw across one element — the same immediate-mode pattern as
 * UISlots, so it reads QuestLog live each frame with no per-frame flexpanel rebuild
 * (runtime flex mutation is a no-op on 0.19; rebuilding child rows every frame would be
 * fragile). It does its own status-color spans inline rather than nesting UIRichText.
 *
 * Per active quest (QuestLog.activeIds(), registration order): the quest `name` as a
 * title (gold when ready to turn in, else plain) over one line per objective —
 * `def.objLabel` formatted with (progress, count), lime when met, muted while pending.
 *
 * GMRT: status is read live from QuestLog each frame (no cached primitive to clobber)
 * and there is no timer (no Time.raw/delta). The element's panel/bg is a separate
 * UIPanel component (NaN-guarded there); this draws text only and is NaN-guarded too.
 */
globalThis.UIQuestTracker = class UIQuestTracker {
  constructor(t = {}) {
    // Font KEYS (resolved via I18n.font at DRAW time), not handles. I18n.font falls
    // back to draw_get_font(), so capturing a handle at construction (a Create event)
    // freezes a stale/invalid font that renders nothing when set later. null = inherit.
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

  // Full pixel height needed by every currently-active quest — the factory sizes the
  // element to this so a UIScroll around it can reveal the overflow.
  contentHeight() {
    const ids = QuestLog.activeIds();
    if (ids.length === 0) return this.padY * 2 + this.objH;
    let h = this.padY * 2;
    for (let i = 0; i < ids.length; i++) {
      const def = QuestLog.def(ids[i]);
      h += this.titleH + def.objectives.length * this.objH;
      if (i < ids.length - 1) h += this.questGap;
    }
    return h;
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
    draw_set_halign(fa_left);
    draw_set_valign(fa_top);

    const x = pos.left + this.padX;
    let y = pos.top + this.padY;

    const titleFont =
      this.titleFontKey !== null ? I18n.font(this.titleFontKey) : -1;
    const bodyFont =
      this.bodyFontKey !== null ? I18n.font(this.bodyFontKey) : -1;

    const ids = QuestLog.activeIds();
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
        const def = QuestLog.def(ids[i]);
        const status = QuestLog.status(ids[i]);

        // Title — gold once every objective is met (ready to turn in).
        if (titleFont !== -1) draw_set_font(titleFont);
        draw_set_color(status.ready ? this.readyColor : this.titleColor);
        draw_text(x, y, I18n.text(def.name));
        y += this.titleH;

        // One line per objective: "v"/"-" marker + formatted label, lime when met.
        if (bodyFont !== -1) draw_set_font(bodyFont);
        for (let o = 0; o < def.objectives.length; o++) {
          const obj = def.objectives[o];
          const prog = status.progress[o];
          const met = prog >= obj.count;
          draw_set_color(met ? this.metColor : this.pendColor);
          draw_text(
            x + this.objIndent,
            y,
            (met ? "v " : "- ") + I18n.text(def.objLabel, prog, obj.count),
          );
          y += this.objH;
        }
        y += this.questGap;
      }
    }

    if (font !== -1) draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_color(color);
    draw_set_alpha(a0);
  }
};
