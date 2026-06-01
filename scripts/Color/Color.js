globalThis.Color = class Color {
  /**
   * @param {number} r
   * @param {number} g
   * @param {number} b
   * @returns {number}
   */
  static rgb(r, g, b) {
    return make_color_rgb(r, g, b);
  }

  /**
   * @param {number} h
   * @param {number} s
   * @param {number} v
   * @returns {number}
   */
  static hsv(h, s, v) {
    return make_color_hsv(h, s, v);
  }

  /**
   * @param {number} col1
   * @param {number} col2
   * @param {number} amount
   * @returns {number}
   */
  static merge(col1, col2, amount) {
    return merge_color(col1, col2, amount);
  }

  /**
   * @param {string} hex
   * @returns {number}
   */
  static parse(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return make_color_rgb(r, g, b);
  }
};

globalThis.color_get_alpha = function color_get_alpha(color) {
  return (color >> 24) / 0xff;
};
