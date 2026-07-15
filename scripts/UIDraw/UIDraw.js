// shared UI arrow/check draw primitives so every chevron/step/sort/tick affordance matches.
// in Core (not Utils) since GemsUI's widgets depend on Core.

/**
 * filled triangle pointing `dir`, centered at (cx, cy), half-size `h`. draw_triangle_color
 * (renders on GMRT 0.20).
 * @param {number} cx @param {number} cy
 * @param {"left"|"right"|"up"|"down"} dir @param {number} h half-size @param {number} col
 */
globalThis.drawUIArrow = function drawUIArrow(cx, cy, dir, h, col) {
  const b = h * 0.85; // base half-extent, perpendicular to the point
  if (dir === "left") {
    draw_triangle_color(
      cx + h,
      cy - b,
      cx + h,
      cy + b,
      cx - h,
      cy,
      col,
      col,
      col,
      false,
    );
  } else if (dir === "right") {
    draw_triangle_color(
      cx - h,
      cy - b,
      cx - h,
      cy + b,
      cx + h,
      cy,
      col,
      col,
      col,
      false,
    );
  } else if (dir === "up") {
    draw_triangle_color(
      cx - b,
      cy + h,
      cx + b,
      cy + h,
      cx,
      cy - h,
      col,
      col,
      col,
      false,
    );
  } else {
    draw_triangle_color(
      cx - b,
      cy - h,
      cx + b,
      cy - h,
      cx,
      cy + h,
      col,
      col,
      col,
      false,
    ); // down
  }
};

/**
 * checkmark (two width-lines) centered at (cx, cy), scaled by `s`. draw_line_width_color
 * (renders on GMRT 0.20).
 * @param {number} cx @param {number} cy @param {number} s scale @param {number} col @param {number} [w] stroke width override
 */
globalThis.drawUICheck = function drawUICheck(cx, cy, s, col, w) {
  const lw = w ?? Math.max(2, s * 0.12);
  draw_line_width_color(
    cx - 0.26 * s,
    cy + 0.02 * s,
    cx - 0.07 * s,
    cy + 0.2 * s,
    lw,
    col,
    col,
  );
  draw_line_width_color(
    cx - 0.07 * s,
    cy + 0.2 * s,
    cx + 0.28 * s,
    cy - 0.22 * s,
    lw,
    col,
    col,
  );
};

/**
 * resolve a widget font option at DRAW time: an I18n font KEY (string) resolves live
 * (a cached handle dangles after a locale reload — I18n.load deletes the old handles);
 * a raw handle (or -1 = inherit) passes through. Every font-taking widget routes through
 * this, so the GemsUI convention of passing key strings works uniformly.
 * @param {number|string} f @returns {number}
 */
globalThis.resolveUIFont = function resolveUIFont(f) {
  return typeof f === "string" ? I18n.font(f) : f;
};

/**
 * capture the draw-state quintet a widget onDraw mutates; pair with uiDrawRestore.
 * Stateless — returns a plain snapshot object — so sequential/nested use can't corrupt
 * a shared slot.
 * @returns {{font:number, halign:number, valign:number, color:number, alpha:number}}
 */
globalThis.uiDrawSave = function uiDrawSave() {
  return {
    font: draw_get_font(),
    halign: draw_get_halign(),
    valign: draw_get_valign(),
    color: draw_get_color(),
    alpha: draw_get_alpha(),
  };
};

/**
 * restore a uiDrawSave snapshot (unconditional — restoring an untouched field is a no-op).
 * @param {{font:number, halign:number, valign:number, color:number, alpha:number}} st
 */
globalThis.uiDrawRestore = function uiDrawRestore(st) {
  draw_set_font(st.font);
  draw_set_halign(st.halign);
  draw_set_valign(st.valign);
  draw_set_color(st.color);
  draw_set_alpha(st.alpha);
};
