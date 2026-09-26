/**
 * Collapsible-section header. Toggling must change layout height, so it inserts/removes the body
 * in the container, which reflows reliably, rather than toggling `enabled`. The body is removed,
 * not destroyed, so reopening is cheap. Toggles on release-inside.
 * @implements {UIComponent}
 */
globalThis.UIAccordion = class UIAccordion {
  constructor(acc = {}) {
    this.title = acc.title ?? ""; // string or () => string
    this.expanded = acc.expanded ?? false;
    this.focusable = true;
    this.body = acc.body ?? null; // inserted/removed on toggle
    this.onToggle = acc.onToggle ?? noop;
    this.font = acc.font ?? -1;
    this.rad = acc.rad ?? 0;

    this.titleColor = acc.titleColor ?? c_white;
    this.headerColor = acc.headerColor ?? c_dkgray;
    this.headerHover = acc.headerHover ?? c_gray;
    this.chevronColor = acc.chevronColor ?? c_gray;
    this.chevronHover = acc.chevronHover ?? c_white;

    this._el = null; // host element, stashed each onUpdate for the click closure
    this._fsm = new UITrigger({
      onClick: () => this.toggle(this._el),
    });
  }

  _title() {
    return typeof this.title === "function" ? this.title() : this.title;
  }

  toggle(element) {
    this.expanded = !this.expanded;
    const c = element.parent;
    if (c !== null && this.body !== null) {
      if (this.expanded) {
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
    const st = UIDraw.save();

    draw_set_alpha(1);

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

    const fnt = UIDraw.font(this.font);
    if (fnt !== -1) draw_set_font(fnt);
    draw_set_valign(fa_middle);

    const ch = element.state.hover ? this.chevronHover : this.chevronColor;
    const ah = 5;
    UIDraw.arrow(
      pos.left + pos.width - pad - ah,
      cy,
      this.expanded ? "down" : "right",
      ah,
      ch,
    );

    draw_set_halign(fa_left);
    draw_set_color(this.titleColor);
    draw_text(pos.left + pad, cy, this._title());

    UIDraw.restore(st);
  }

  /** A confirm toggles the body. */
  onNav(element, ev) {
    if (ev.kind !== "confirm") return false;
    this.toggle(element);
    return true;
  }
};
