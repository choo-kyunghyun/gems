/**
 * @implements {UIComponent}
 * Collapsible-section header. Toggling must change layout height, so it inserts/removes
 * the body from the container (structural insert/remove reflows reliably) rather than the
 * `enabled`-flag toggle UITabs uses. Body is removed not destroyed, so reopening is cheap.
 * Toggles on release-inside (standard click semantics, via the UITrigger delegate) — the
 * one widget deliberately moved off press-commit in the FSM consolidation.
 */
globalThis.UIAccordion = class UIAccordion {
  /** acc: { title, expanded, body, onToggle, font, rad, titleColor, headerColor, headerHover, chevronColor, chevronHover } */
  constructor(acc = {}) {
    this.title = acc.title ?? ""; // string or () => string
    this.expanded = acc.expanded ?? false;
    this.body = acc.body ?? null; // inserted/removed on toggle
    this.onToggle = acc.onToggle ?? noop;
    this.font = acc.font ?? -1;
    this.rad = acc.rad ?? 0;

    this.titleColor = acc.titleColor ?? c_white;
    this.headerColor = acc.headerColor ?? c_dkgray;
    this.headerHover = acc.headerHover ?? c_gray;
    this.chevronColor = acc.chevronColor ?? c_gray;
    this.chevronHover = acc.chevronHover ?? c_white;

    this._el = null; // host element, stashed each onUpdate for the onClick closure
    // internal FSM delegate (UITrigger) — commit on release-inside toggles the section.
    this._fsm = new UITrigger({
      onClick: () => this.toggle(this._el),
    });
  }

  _title() {
    return typeof this.title === "function" ? this.title() : this.title;
  }

  /**
   * Flip expanded, inserting/removing the body from the parent.   */
  toggle(element) {
    this.expanded = !this.expanded;
    const c = element.parent;
    if (c !== null && this.body !== null) {
      if (this.expanded) {
        // right after this header → top of the section.
        c.insertChild(this.body, c.children.indexOf(element) + 1);
      } else {
        c.removeChild(this.body);
      }
    }
    this.onToggle(this.expanded);
  }

  onUpdate(element, block) {
    this._el = element;
    return this._fsm.onUpdate(element, block);
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();
    const st = uiDrawSave();

    draw_set_alpha(1);

    // header background.
    const bg = element.state.hover ? this.headerHover : this.headerColor;
    draw_roundrect_color_ext(
      pos.left,
      pos.top,
      pos.left + pos.width,
      pos.top + pos.height,
      this.rad,
      this.rad,
      bg,
      bg,
      false,
    );

    const cy = pos.top + pos.height * 0.5;
    const pad = 14;

    const fnt = resolveUIFont(this.font);
    if (fnt !== -1) draw_set_font(fnt);
    draw_set_valign(fa_middle);

    // chevron: right when collapsed, down when expanded. shared drawUIArrow.
    const ch = element.state.hover ? this.chevronHover : this.chevronColor;
    const ah = 5;
    drawUIArrow(
      pos.left + pos.width - pad - ah,
      cy,
      this.expanded ? "down" : "right",
      ah,
      ch,
    );

    // title.
    draw_set_halign(fa_left);
    draw_set_color(this.titleColor);
    draw_text(pos.left + pad, cy, this._title());

    uiDrawRestore(st);
  }

  /**
   * UINav: confirm expands/collapses the section.
   */
  navActivate(element) {
    this.toggle(element);
  }
};
