/**
 * @implements {UIComponent}
 * Multi-run text: colored spans and inline icons from one markup string.
 *
 * Markup:
 *   [c=#ff5555]…[/c]   colored span ([/] closes too); #rrggbb hex or an `opts.palette` name.
 *   [spr=<name>]       inline icon; [spr=<name>:2] picks a subimage. BUG: the sprite must be
 *                      raster, not SVG (docs/GMRT.md).
 *   \n                 hard line break.
 * Spans nest; unknown tags are dropped. Self-sizes to the parsed content and never reads the
 * element width; halign resolves against the widest line. The parse is rebuilt only on a
 * source-string change.
 */
globalThis.UIRichText = class UIRichText {
  /** s: { textRef: () => string, color, alpha, halign, font, iconSize, palette } */
  constructor(s = {}) {
    this.textRef = s.textRef ?? (() => "");
    this.color = s.color ?? c_white; // outside any span
    this.alpha = s.alpha ?? 1;
    this.halign = s.halign ?? fa_left;
    this.font = s.font ?? -1;
    this.iconSize = s.iconSize ?? -1; // -1 = match the line height
    this.palette = s.palette ?? {}; // name → colorInt for [c=name]

    this.cache = null; // null forces the first parse even when text is ""
    this._items = []; // { kind:"text", s, c } | { kind:"icon", spr, sub, c } | { kind:"br" }
    this._lineWidths = [0];
    this._lineHeight = 0;
    this._iconPx = 0;
    this._width = 0;
    this._height = 0;
  }

  onUpdate(element, block) {
    const str = this.textRef();
    if (this.cache !== str) {
      this.cache = str;

      const fnt = resolveUIFont(this.font);
      const font0 = draw_get_font();
      if (fnt !== -1) draw_set_font(fnt);

      this._parse(str);
      this._measure();
      uiResizeTo(element, this._width, this._height);

      if (fnt !== -1) draw_set_font(font0);
    }
    return block;
  }

  onDraw(element) {
    const pos = element.getLayoutPosition();

    const st = uiDrawSave();
    const fnt = resolveUIFont(this.font);
    if (fnt !== -1) draw_set_font(fnt);
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
          draw_sprite_stretched_ext(
            it.spr,
            it.sub,
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

    uiDrawRestore(st);
  }

  _lineOffset(line) {
    if (this.halign === fa_left) return 0;
    const slack = this._width - this._lineWidths[line];
    return this.halign === fa_center ? slack * 0.5 : slack;
  }

  _parse(str) {
    const items = [];
    const stack = [this.color]; // top is the active span color
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
  }

  _color(v) {
    if (this.palette[v] != null) return this.palette[v];
    if (v.charAt(0) === "#") return Color.parse(v);
    return this.color;
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
    // a ref, not a number (docs/GMRT.md): validity is checked at draw time
    return { kind: "icon", spr: asset_get_index(name), sub, c: color };
  }

  /** Expects the font already set. */
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
