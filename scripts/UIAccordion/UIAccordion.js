/**
 * @implements {UIComponent}
 * Collapsible-section header — lives on a fixed-height row element (built by
 * gemsAccordion). Draws its own background + title + a chevron (a draw_triangle, so
 * it needs no font glyph) and toggles its body on click. Unlike UITabs (which stacks
 * pages and only toggles `enabled`), an accordion section must change the layout's
 * height when it opens/closes, so it inserts/removes the body element from the item
 * container — a structural change, which reflows reliably (the flexpanel #15065 bug
 * is about the per-frame style *setters*, not insert/remove + recalculate). The body
 * element is kept alive across collapses (removed, not destroyed) so reopening is
 * cheap.
 *
 * The expand/collapse indicator is a filled triangle chevron (draw_triangle_color),
 * pointing right when collapsed and down when expanded. There's no toggle animation:
 * the section snaps open/closed (the body is inserted/removed structurally, not tweened).
 *
 * GMRT note: hover state is read live from the pointer each frame (no cached
 * primitive bool to be clobbered).
 */
globalThis.UIAccordion = class UIAccordion {
  constructor(acc = {}) {
    this.title = acc.title ?? ""; // string or () => string
    this.expanded = acc.expanded ?? false;
    this.body = acc.body ?? null; // element inserted/removed on toggle
    this.onToggle = acc.onToggle ?? noop;
    this.font = acc.font ?? -1;
    this.rad = acc.rad ?? 0;

    this.titleColor = acc.titleColor ?? c_white;
    this.headerColor = acc.headerColor ?? c_dkgray;
    this.headerHover = acc.headerHover ?? c_gray;
    this.chevronColor = acc.chevronColor ?? c_gray;
    this.chevronHover = acc.chevronHover ?? c_white;

    this._hover = false;
  }

  _title() {
    return typeof this.title === "function" ? this.title() : this.title;
  }

  toggle(element) {
    this.expanded = !this.expanded;
    const c = element.parent;
    if (c !== null && this.body !== null) {
      if (this.expanded) {
        // Insert right after this header so it sits at the top of the section.
        c.insertChild(this.body, c.children.indexOf(element) + 1);
      } else {
        c.removeChild(this.body);
      }
    }
    this.onToggle(this.expanded);
  }

  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return block; // unlaid-out (NaN) or zero-width

    const mx = device_mouse_x_to_gui(0);
    const my = device_mouse_y_to_gui(0);
    this._hover = !block && element.positionMeeting(mx, my);

    if (this._hover && mouse_check_button_pressed(mb_left)) {
      this.toggle(element);
      return true;
    }
    return this._hover || block;
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

    // Header background.
    const bg = this._hover ? this.headerHover : this.headerColor;
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

    if (this.font !== -1) draw_set_font(this.font);
    draw_set_valign(fa_middle);

    // Indicator: a filled triangle chevron — right when collapsed, down when expanded.
    // Shared drawUIArrow so it matches UISelect/UIStepper/UIDropdown/UITable affordances.
    const ch = this._hover ? this.chevronHover : this.chevronColor;
    const ah = 5;
    drawUIArrow(
      pos.left + pos.width - pad - ah,
      cy,
      this.expanded ? "down" : "right",
      ah,
      ch,
    );

    // Title, left-aligned and vertically centered.
    draw_set_halign(fa_left);
    draw_set_color(this.titleColor);
    draw_text(pos.left + pad, cy, this._title());

    draw_set_font(font);
    draw_set_halign(halign);
    draw_set_valign(valign);
    draw_set_color(color);
    draw_set_alpha(a0);
  }

  // UINav: confirm expands/collapses the section (the body's focusables then become
  // collectable next frame). Marks the header focusable.
  navActivate(element) {
    this.toggle(element);
  }
};
