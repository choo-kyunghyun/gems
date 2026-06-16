/**
 * @implements {UIComponent}
 * Multi-run text: colored spans + inline icons parsed from one markup string, a
 * richer sibling of UIText (item rarity, damage colors, keybind glyphs in help text).
 *
 * Markup (square-bracket tags):
 *   [c=#ff5555]…[/c]   colored span; [/] closes too. Color is a #rrggbb hex, or a
 *                      name resolved through `opts.palette` ({ name: colorInt }).
 *   [spr=spr_name]     inline icon by sprite asset name; [spr=spr_name:2] picks a
 *                      subimage. The sprite MUST be raster (SVG reports 0 frames on
 *                      GMRT and faults draw_sprite — see CLAUDE.md).
 *   \n                 hard line break.
 * Spans nest (a color stack); unknown tags are dropped. Everything else is literal
 * text. The element self-sizes to the parsed content (setWidth/Height in onUpdate,
 * applied by the flexpanel layout on GMRT 0.20) — but, per the kit rule, this is a
 * text drawer and still takes NO `!(pos.width > 0)` guard: everything is drawn from
 * `pos.left/top` + our own measured advances (never from `pos.width`), which
 * draw_text/draw_sprite tolerate, so a NaN width on the first frame after a scene
 * transition is harmless. halign is resolved against the widest line internally,
 * independent of element width.
 *
 * GMRT note: parse result is cached and only rebuilt when the source string changes;
 * no cached primitive bool, no Map/Set iteration, no array destructuring.
 */
globalThis.UIRichText = class UIRichText {
  /** @param {Object} [s] { textRef: () => string, color, alpha, halign, font, iconSize, palette } */
  constructor(s = {}) {
    this.textRef = s.textRef ?? (() => "");
    this.color = s.color ?? c_white; // default / span-less color
    this.alpha = s.alpha ?? 1;
    this.halign = s.halign ?? fa_left;
    this.font = s.font ?? -1;
    this.iconSize = s.iconSize ?? -1; // -1 = match the line height
    this.palette = s.palette ?? {}; // name → colorInt for [c=name]

    this.cache = null; // force the first parse even when the text is ""
    this._items = []; // { kind:"text", s, c } | { kind:"icon", spr, sub, c } | { kind:"br" }
    this._lineWidths = [0];
    this._lineHeight = 0;
    this._iconPx = 0;
    this._width = 0;
    this._height = 0;
  }

  /** Re-parse + re-measure + self-size when the source string changed. @param {UIElement} element @param {boolean} block @returns {boolean} */
  onUpdate(element, block) {
    const str = this.textRef();
    if (this.cache !== str) {
      this.cache = str;

      const font0 = draw_get_font();
      if (this.font !== -1) draw_set_font(this.font);

      this._parse(str);
      this._measure();

      if (
        element.getWidth().value != this._width ||
        element.getHeight().value != this._height
      ) {
        element.setWidth(this._width, flexpanel_unit.point);
        element.setHeight(this._height, flexpanel_unit.point);
      }

      if (this.font !== -1) draw_set_font(font0);
    }
    return block;
  }

  /** @param {UIElement} element */
  onDraw(element) {
    const pos = element.getLayoutPosition();

    const font0 = draw_get_font();
    if (this.font !== -1) draw_set_font(this.font);
    const halign0 = draw_get_halign();
    const valign0 = draw_get_valign();
    const color0 = draw_get_color();
    const alpha0 = draw_get_alpha();
    draw_set_halign(fa_left);
    draw_set_valign(fa_top);

    const lh = this._lineHeight;
    const iconPx = this._iconPx;
    const items = this._items;
    let line = 0;
    let x = pos.left + this._lineOffset(0);
    let y = pos.top;

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "br") {
        line++;
        x = pos.left + this._lineOffset(line);
        y += lh;
      } else if (it.kind === "icon") {
        if (sprite_exists(it.spr)) {
          const n = max(1, sprite_get_number(it.spr));
          const sub = clamp(it.sub, 0, n - 1);
          draw_sprite_stretched_ext(
            it.spr,
            sub,
            x,
            y + (lh - iconPx) * 0.5,
            iconPx,
            iconPx,
            it.c,
            this.alpha,
          );
        }
        x += iconPx;
      } else {
        draw_text_color(x, y, it.s, it.c, it.c, it.c, it.c, this.alpha);
        x += string_width(it.s);
      }
    }

    draw_set_halign(halign0);
    draw_set_valign(valign0);
    draw_set_color(color0);
    draw_set_alpha(alpha0);
    if (this.font !== -1) draw_set_font(font0);
  }

  // Left edge of `line` so the widest line sits flush and shorter lines align within
  // it — independent of the (width-0) element rect.
  _lineOffset(line) {
    if (this.halign === fa_left) return 0;
    const slack = this._width - this._lineWidths[line];
    return this.halign === fa_center ? slack * 0.5 : slack;
  }

  // ── Parse ──────────────────────────────────────────────────────
  _parse(str) {
    const items = [];
    const stack = [this.color]; // color stack; top is the active span color
    let i = 0;
    let runStart = 0;

    while (i < str.length) {
      if (str.charAt(i) === "[") {
        const end = str.indexOf("]", i);
        if (end === -1) break; // no closing bracket — flush the remainder as text
        if (i > runStart)
          this._pushText(
            items,
            str.substring(runStart, i),
            stack[stack.length - 1],
          );
        this._tag(str.substring(i + 1, end), stack, items);
        i = end + 1;
        runStart = i;
      } else {
        i++;
      }
    }
    if (str.length > runStart)
      this._pushText(items, str.substring(runStart), stack[stack.length - 1]);

    this._items = items;
  }

  // Split a literal run on newlines into text segments + break markers.
  _pushText(items, text, color) {
    let start = 0;
    for (let k = 0; k < text.length; k++) {
      if (text.charAt(k) === "\n") {
        if (k > start)
          items.push({ kind: "text", s: text.substring(start, k), c: color });
        items.push({ kind: "br" });
        start = k + 1;
      }
    }
    if (text.length > start)
      items.push({ kind: "text", s: text.substring(start), c: color });
  }

  _tag(tag, stack, items) {
    if (tag === "/" || tag === "/c") {
      if (stack.length > 1) stack.pop();
      return;
    }
    if (tag.substring(0, 2) === "c=") {
      stack.push(this._color(tag.substring(2)));
      return;
    }
    if (tag.substring(0, 4) === "spr=") {
      items.push(this._icon(tag.substring(4), stack[stack.length - 1]));
      return;
    }
    // Unknown tag — drop it.
  }

  _color(v) {
    if (this.palette[v] != null) return this.palette[v];
    if (v.charAt(0) === "#") return Color.parse(v);
    return this.color; // unrecognized name → keep the current color
  }

  _icon(v, color) {
    let name = v;
    let sub = 0;
    const colon = v.indexOf(":");
    if (colon !== -1) {
      name = v.substring(0, colon);
      const n = parseInt(v.substring(colon + 1), 10);
      if (!isNaN(n)) sub = n;
    }
    // asset_get_index returns an opaque sprite *ref* (not a numeric index) on GMRT,
    // so a `>= 0` test fails — validity is checked with sprite_exists at draw time.
    return { kind: "icon", spr: asset_get_index(name), sub, c: color };
  }

  // ── Measure (font already set by the caller) ───────────────────
  _measure() {
    this._lineHeight = string_height("Mg");
    this._iconPx = this.iconSize > 0 ? this.iconSize : this._lineHeight;

    const widths = [];
    let lineW = 0;
    const items = this._items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "br") {
        widths.push(lineW);
        lineW = 0;
      } else if (it.kind === "icon") {
        lineW += this._iconPx;
      } else {
        lineW += string_width(it.s);
      }
    }
    widths.push(lineW);
    this._lineWidths = widths;

    let maxW = 0;
    for (let i = 0; i < widths.length; i++)
      if (widths[i] > maxW) maxW = widths[i];
    this._width = maxW;
    this._height = widths.length * this._lineHeight;
  }
};
