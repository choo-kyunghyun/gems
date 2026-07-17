// Thin wrappers over GM color ints + the "#rrggbb" parser used by
// theme/zone/level data.
globalThis.Color = class Color {
  /** @param {number} r @param {number} g @param {number} b @returns {number} */
  static rgb(r, g, b) {
    return make_color_rgb(r, g, b);
  }

  /**
   * Each of h/s/v is 0–255 (GM's range, not 360/100/100).
   * @param {number} h @param {number} s @param {number} v @returns {number}
   */
  static hsv(h, s, v) {
    return make_color_hsv(h, s, v);
  }

  /**
   * One-shot lerp; #15546: don't ease a packed int per frame (floors to
   * black) — use float r/g/b + Tween.approachColor.
   * @param {number} col1 @param {number} col2 @param {number} amount 0→1
   * @returns {number}
   */
  static merge(col1, col2, amount) {
    return merge_color(col1, col2, amount);
  }

  /** @param {string} hex `"#rrggbb"` @returns {number} */
  static parse(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return make_color_rgb(r, g, b);
  }

  /**
   * Alpha [0,1] from a 32-bit `$AABBGGRR` IDE color literal. Plain RGB ints
   * have no alpha byte.
   * @param {number} color @returns {number}
   */
  static alpha(color) {
    return (color >> 24) / 0xff;
  }
};
