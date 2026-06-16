globalThis.noop = function noop() {};

globalThis.uuid = function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

globalThis.rem = function rem(value) {
  const font = draw_get_font();
  const info = font_get_info(font);
  if (info === undefined) return value * 16;
  return value * info.size;
};

// Small filled triangle "arrow" affordance pointing `dir` ("left"|"right"|"up"|"down"),
// centered at (cx, cy) with half-size `h`. Shared by the arrow widgets (UISelect /
// UIStepper / UIDropdown / UITable / UIAccordion) so every chevron/step/sort affordance
// matches. Uses draw_triangle_color, which renders on GMRT 0.20 (it was a no-op on the
// dropped 0.19, which is why these were "<"/">"/"v"/"^" text glyphs before).
globalThis.drawUIArrow = function drawUIArrow(cx, cy, dir, h, col) {
  const b = h * 0.85; // base half-extent, perpendicular to the point
  if (dir === "left") {
    draw_triangle_color(cx + h, cy - b, cx + h, cy + b, cx - h, cy, col, col, col, false);
  } else if (dir === "right") {
    draw_triangle_color(cx - h, cy - b, cx - h, cy + b, cx + h, cy, col, col, col, false);
  } else if (dir === "up") {
    draw_triangle_color(cx - b, cy + h, cx + b, cy + h, cx, cy - h, col, col, col, false);
  } else {
    draw_triangle_color(cx - b, cy - h, cx + b, cy - h, cx, cy + h, col, col, col, false); // down
  }
};

// A checkmark (two width-lines) centered at (cx, cy), scaled by `s`; `w` overrides the
// stroke width. Shared by UICheckbox (tick) and UIQuestTracker (objective-met marker).
// draw_line_width_color works on GMRT 0.20 (was a no-op on the dropped 0.19).
globalThis.drawUICheck = function drawUICheck(cx, cy, s, col, w) {
  const lw = w ?? Math.max(2, s * 0.12);
  draw_line_width_color(cx - 0.26 * s, cy + 0.02 * s, cx - 0.07 * s, cy + 0.2 * s, lw, col, col);
  draw_line_width_color(cx - 0.07 * s, cy + 0.2 * s, cx + 0.28 * s, cy - 0.22 * s, lw, col, col);
};
