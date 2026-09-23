globalThis.Color = {
  rgb(r, g, b) {
    return make_color_rgb(r, g, b);
  },

  /** Each of h/s/v is 0–255 (GM's range, not 360/100/100). */
  hsv(h, s, v) {
    return make_color_hsv(h, s, v);
  },

  /** One-shot only: never ease a packed int per frame (docs/GMRT.md). */
  merge(col1, col2, amount) {
    return merge_color(col1, col2, amount);
  },

  parse(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return make_color_rgb(r, g, b);
  },

  /** Alpha [0,1] from a `$AABBGGRR` IDE color literal; plain RGB ints have no alpha byte. */
  alpha(color) {
    return (color >> 24) / 0xff;
  },
};
