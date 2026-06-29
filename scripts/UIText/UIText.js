// text label. re-measures only on string or font change; self-sizes via setWidth/setHeight.
// draws from pos.left/top so no pos.width NaN guard needed.
/**
 * @typedef {Object} UITextOpts
 * @property {() => string} [textRef] @property {number} [halign] fa_* @property {number} [color] @property {number} [alpha]
 * @property {number|string} [font] font handle (-1 = current), or an I18n font KEY ("header"/…)
 * @property {number} [sep] line separation @property {number} [w] wrap width
 * @property {number} [xscale] @property {number} [yscale] @property {number} [angle]
 * @implements {UIComponent}
 */
globalThis.UIText = class UIText {
  /** @param {UITextOpts} [text] */
  constructor(text = {}) {
    this.textRef = text.textRef ?? (() => "");
    this.halign = text.halign ?? fa_left;
    this.xscale = text.xscale ?? 1;
    this.yscale = text.yscale ?? 1;
    this.angle = text.angle ?? 0;
    this.color = text.color ?? c_white;
    this.alpha = text.alpha ?? 1;
    this.sep = text.sep ?? -1;
    this.w = text.w ?? -1;
    // number handle OR I18n font key (string). must NOT be pre-resolved: I18n.load deletes old
    // handles on a locale switch, so a cached handle dangles. see "resolve I18n.font at draw time".
    this.font = text.font ?? -1;
    this.cache = "";
    this.cacheFont = -1; // resolved handle used for cached measure; re-measure if it changes
  }

  /** re-resolve each call so it survives a locale reload. @returns {number} */
  _font() {
    return typeof this.font === "string" ? I18n.font(this.font) : this.font;
  }

  /**
   * @param {UIElement} element
   * @param {boolean} block
   * @returns {boolean}
   */
  onUpdate(element, block) {
    const str = this.textRef();
    const fnt = this._font();
    // re-measure on string OR font change — a locale switch swaps both and may change metrics.
    if (this.cache !== str || this.cacheFont !== fnt) {
      this.cache = str;
      this.cacheFont = fnt;

      const font = draw_get_font();
      if (fnt !== -1) draw_set_font(fnt);

      const width = string_width_ext(this.cache, this.sep, this.w);
      const height = string_height_ext(this.cache, this.sep, this.w);

      if (
        element.getWidth().value != width ||
        element.getHeight().value != height
      ) {
        element.setWidth(width, flexpanel_unit.point);
        element.setHeight(height, flexpanel_unit.point);
      }

      if (fnt !== -1) draw_set_font(font);
    }
    return block;
  }

  /**
   * @param {UIElement} element
   */
  onDraw(element) {
    const pos = element.getLayoutPosition();
    let x = pos.left;
    let y = pos.top;

    const font = draw_get_font();
    const fnt = this._font();
    if (fnt !== -1) draw_set_font(fnt);

    const halign = draw_get_halign();
    draw_set_halign(this.halign);
    if (this.halign === fa_center) x += pos.width / 2;
    else if (this.halign === fa_right) x += pos.width;

    // snap to integer GUI pixels so SDF glyph stems land on the pixel grid — a sub-pixel
    // origin from fractional flex layout softens small text.
    x = floor(x);
    y = floor(y);

    draw_text_ext_transformed_color(
      x,
      y,
      this.cache,
      this.sep,
      this.w,
      this.xscale,
      this.yscale,
      this.angle,
      this.color,
      this.color,
      this.color,
      this.color,
      this.alpha,
    );

    draw_set_halign(halign);
    if (fnt !== -1) draw_set_font(font);
  }
};
