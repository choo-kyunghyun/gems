// Shared immediate-mode draw primitives for the Core UI widgets — the small
// arrow/chevron and checkmark affordances several components render the same way.
// Kept out of the generic Utils grab-bag since they're UI-specific; consumed by
// UISelect/UIStepper/UIDropdown/UITable/UIAccordion + Dialogue (arrow) and
// UICheckbox/UIQuestTracker (check). (GemsUI builds these widgets, so it depends
// on Core — these live in Core so that arrow stays pointing the right way.)

/**
 * Small filled triangle "arrow" affordance pointing `dir`, centered at (cx, cy)
 * with half-size `h`, so every chevron/step/sort affordance matches. Uses
 * draw_triangle_color (renders on GMRT 0.20; was a no-op on 0.19, when these were
 * "<"/">"/"v"/"^" text glyphs).
 * @param {number} cx @param {number} cy
 * @param {"left"|"right"|"up"|"down"} dir @param {number} h half-size @param {number} col
 */
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

/**
 * A checkmark (two width-lines) centered at (cx, cy), scaled by `s`. Shared by
 * UICheckbox (tick) and UIQuestTracker (objective-met marker). draw_line_width_color
 * renders on GMRT 0.20 (was a no-op on 0.19).
 * @param {number} cx @param {number} cy @param {number} s scale @param {number} col @param {number} [w] stroke width override
 */
globalThis.drawUICheck = function drawUICheck(cx, cy, s, col, w) {
  const lw = w ?? Math.max(2, s * 0.12);
  draw_line_width_color(cx - 0.26 * s, cy + 0.02 * s, cx - 0.07 * s, cy + 0.2 * s, lw, col, col);
  draw_line_width_color(cx - 0.07 * s, cy + 0.2 * s, cx + 0.28 * s, cy - 0.22 * s, lw, col, col);
};
