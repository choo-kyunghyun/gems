/**
 * @implements {UIComponent}
 * Tab strip — N segments drawn immediate-mode. Horizontal (default): equal-width segments
 * across the strip, the active one filled + underlined. Vertical: fixed `segment`-px segments
 * stacked from the top, the active one filled + an accent bar on its left edge. Selecting swaps
 * content by each overlay's `enabled` flag, never flex mutation, so a switch doesn't reflow.
 * `tabs[i].label` is a string or () => string; `tabs[i].short` (optional, same forms) is drawn
 * INSTEAD of the label, which then shows as the hover tooltip after `tipDelay`.
 * BUG: hover/active are read live each frame, never cached as a bool (docs/GMRT.md #15549).
 */
globalThis.UITabs = class UITabs {
  constructor(tabs = {}) {
    this.tabs = tabs.tabs ?? [];
    this.index = tabs.index ?? 0;
    this.onChange = tabs.onChange ?? noop;
    this.font = tabs.font ?? -1;
    this.vertical = tabs.vertical ?? false;
    this.segment = tabs.segment ?? 56; // vertical: px per segment (horizontal divides the strip)
    this.tipDelay = tabs.tipDelay ?? 0.4; // s of hover dwell before a `short` tab's label tooltip

    this.color = tabs.color ?? c_white; // active label
    this.colorIdle = tabs.colorIdle ?? c_gray; // inactive label
    this.colorHover = tabs.colorHover ?? c_white; // hovered inactive label
    this.activeBg = tabs.activeBg ?? c_dkgray; // active tab fill
    this.accent = tabs.accent ?? c_white; // active indicator (underline / left bar)
    this.border = tabs.border ?? c_dkgray; // rule under (horizontal) / right of (vertical) the strip

    this._hover = -1; // hovered segment index, -1 = none
    this._dwell = 0; // s the pointer has rested on the hovered segment (tooltip timer)

    this._apply();
  }

  _label(i) {
    const l = this.tabs[i].label;
    return typeof l === "function" ? l() : l;
  }

  /** the drawn text: the abbreviation when one is set, else the label */
  _text(i) {
    const s = this.tabs[i].short;
    if (s === undefined || s === null) return this._label(i);
    return typeof s === "function" ? s() : s;
  }

  /** segment rect i (GUI px) for the strip rect `pos` */
  _rect(pos, i) {
    if (this.vertical) {
      const y0 = pos.top + i * this.segment;
      return { x0: pos.left, y0, x1: pos.left + pos.width, y1: y0 + this.segment };
    }
    const segW = pos.width / this.tabs.length;
    const x0 = pos.left + i * segW;
    return { x0, y0: pos.top, x1: x0 + segW, y1: pos.top + pos.height };
  }

  /** segment index under (mx, my), -1 past the last vertical segment */
  _hit(pos, mx, my) {
    const n = this.tabs.length;
    if (this.vertical) {
      const seg = floor((my - pos.top) / this.segment);
      return seg < 0 ? -1 : seg < n ? seg : -1; // BUG: nested ?:, no && (docs/GMRT.md #15549)
    }
    return clamp(floor(((mx - pos.left) / pos.width) * n), 0, n - 1);
  }

  /** sync overlay visibility to active index via `enabled` flag — never reflows. */
  _apply() {
    for (let i = 0; i < this.tabs.length; i++) {
      this.tabs[i].content.enabled = i === this.index;
    }
  }

  /** No-op if already active or out of range. */
  select(i) {
    if (i === this.index || i < 0 || i >= this.tabs.length) return;
    this.index = i;
    this._apply();
    this.onChange(i);
  }

  onUpdate(element, block) {
    const pos = element.getLayoutPosition();
    const n = this.tabs.length;
    if (n === 0) return block;

    const mx = Input.pointer.x;
    const my = Input.pointer.y;
    const inside = !block && element.positionMeeting(mx, my);

    const prev = this._hover;
    this._hover = inside ? this._hit(pos, mx, my) : -1;
    // restarts whenever the hovered segment changes or the pointer leaves.
    // BUG: nested ?: rather than && (docs/GMRT.md #15549)
    this._dwell =
      this._hover === -1 ? 0 : this._hover === prev ? this._dwell + Time.raw : 0;
    if (this._hover !== -1) {
      if (this.tabs[this._hover].short !== undefined) {
        if (this._dwell >= this.tipDelay) Tooltip.set(this._label(this._hover));
      }
      // selects on PRESS — deliberately snappier than a release-inside commit
      if (Input.pointer.left.pressed) {
        this.select(this._hover);
        return true;
      }
    }
    return inside || block;
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();
    const n = this.tabs.length;
    if (n === 0) return;

    const st = uiDrawSave();

    const fnt = resolveUIFont(this.font);
    if (fnt !== -1) draw_set_font(fnt);
    draw_set_halign(fa_center);
    draw_set_valign(fa_middle);

    const inset = 3; // gap between adjacent tab fills
    const barH = 3; // accent indicator thickness
    const right = pos.left + pos.width;
    const bottom = pos.top + pos.height;

    draw_set_alpha(1);
    this._rule(pos, right, bottom);

    for (let i = 0; i < n; i++) {
      const r = this._rect(pos, i);
      const active = i === this.index;

      if (active) {
        if (this.vertical) {
          draw_roundrect_color_ext(
            r.x0,
            r.y0 + inset,
            r.x1 - inset,
            r.y1 - inset,
            6,
            6,
            this.activeBg,
            this.activeBg,
            false,
          );
          draw_rectangle_color(
            r.x0,
            r.y0 + inset,
            r.x0 + barH,
            r.y1 - inset,
            this.accent,
            this.accent,
            this.accent,
            this.accent,
            false,
          );
        } else {
          draw_roundrect_color_ext(
            r.x0 + inset,
            r.y0,
            r.x1 - inset,
            r.y1,
            6,
            6,
            this.activeBg,
            this.activeBg,
            false,
          );
          draw_rectangle_color(
            r.x0 + inset,
            r.y1 - barH,
            r.x1 - inset,
            r.y1,
            this.accent,
            this.accent,
            this.accent,
            this.accent,
            false,
          );
        }
      }

      draw_set_color(
        active
          ? this.color
          : i === this._hover
            ? this.colorHover
            : this.colorIdle,
      );
      // floor the centered anchor to integer GUI px — fractional centers soften SDF labels.
      draw_text(
        floor((r.x0 + r.x1) * 0.5),
        floor((r.y0 + r.y1) * 0.5),
        this._text(i),
      );
    }

    // BUG: re-stroke the rule as a trailing untextured draw, so the last label is flushed out of
    // the pending batch before a clip drawn right after can capture it (docs/GMRT.md #6523).
    // Redundant with the rule above, so free.
    draw_set_alpha(1);
    this._rule(pos, right, bottom);

    uiDrawRestore(st);
  }

  _rule(pos, right, bottom) {
    if (this.vertical) {
      draw_line_color(right - 1, pos.top, right - 1, bottom, this.border, this.border);
    } else {
      draw_line_color(pos.left, bottom - 1, right, bottom - 1, this.border, this.border);
    }
  }

  /** The axis switches tabs, so the strip is one focus stop. */
  navAxis(element, dir) {
    this.select(clamp(this.index + dir, 0, this.tabs.length - 1));
  }

  navActivate(element) {
    if (this.tabs.length > 0) this.select((this.index + 1) % this.tabs.length);
  }
};
