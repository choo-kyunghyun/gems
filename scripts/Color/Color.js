/**
 * Color helpers over GameMaker's color ints (24-bit BGR). Thin wrappers plus the
 * `"#rrggbb"` parser the theme/zone/level data use.
 */
globalThis.Color = class Color {
  /** @param {number} r @param {number} g @param {number} b @returns {number} a color int from RGB channels. */
  static rgb(r, g, b) {
    return make_color_rgb(r, g, b);
  }

  /** @param {number} h @param {number} s @param {number} v @returns {number} a color int from HSV (each 0–255). */
  static hsv(h, s, v) {
    return make_color_hsv(h, s, v);
  }

  /** @param {number} col1 @param {number} col2 @param {number} amount 0→1 blend @returns {number} the blended color int. */
  static merge(col1, col2, amount) {
    return merge_color(col1, col2, amount);
  }

  /** @param {string} hex a `"#rrggbb"` string @returns {number} the parsed color int. */
  static parse(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return make_color_rgb(r, g, b);
  }

  /**
   * Alpha channel [0,1] of a 32-bit `$AABBGGRR` color (GameMaker's hex color-literal
   * format — e.g. an IDE color-picker value). Plain RGB ints carry no alpha byte.
   * @param {number} color @returns {number}
   */
  static alpha(color) {
    return (color >> 24) / 0xff;
  }
};
