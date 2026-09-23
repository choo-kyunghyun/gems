// Shared widget primitives: glyph draws, draw-state save/restore, and the update-time idioms
// every widget repeats.

/**
 * `h` is the half-size.
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
    );
  }
};

/**
 * The ◀ ▶ pair chrome; the caller draws its own centered label at the returned cy.
 */
globalThis.drawUIArrowPair = function drawUIArrowPair(pos, leftCol, rightCol) {
  const cy = pos.top + pos.height * 0.5;
  const pad = 14;
  const ah = 5;
  drawUIArrow(pos.left + pad + ah, cy, "left", ah, leftCol);
  drawUIArrow(pos.left + pos.width - pad - ah, cy, "right", ah, rightCol);
  return cy;
};

/**
 * Which half of `element` the pointer is over: -1 left / +1 right / 0 not hovering or
 * blocked. Latch it before the click FSM runs, so the release-edge click commits from the
 * same frame's side.
 */
globalThis.uiPointerSide = function uiPointerSide(element, block) {
  if (block) return 0;
  const mx = Input.pointer.x;
  if (!element.positionMeeting(mx, Input.pointer.y)) return 0;
  const pos = element.getLayoutPosition();
  return mx < pos.left + pos.width * 0.5 ? -1 : 1;
};

/**
 * Fake-thickness outline: `thick` nested 1px strokes inset inward, since a GM roundrect
 * outline is always 1px. `rad` is constant across insets.
 */
globalThis.drawUIOutline = function drawUIOutline(
  x1,
  y1,
  x2,
  y2,
  rad,
  col,
  thick,
) {
  for (let i = 0; i < thick; i++) {
    draw_roundrect_color_ext(
      x1 + i,
      y1 + i,
      x2 - i,
      y2 - i,
      rad,
      rad,
      col,
      col,
      true,
    );
  }
};

/**
 * Rounded panel + 1px border for chrome drawn outside the UIElement tree. `style` is
 * { panelColor, panelAlpha, borderColor, borderAlpha? }; `a` scales both alphas. Leaves the
 * draw alpha at the border's; the caller restores its own draw state.
 */
globalThis.drawUIPanel = function drawUIPanel(
  x1,
  y1,
  x2,
  y2,
  rad,
  style,
  a = 1,
) {
  draw_set_alpha((style.panelAlpha ?? 1) * a);
  draw_roundrect_color_ext(
    x1,
    y1,
    x2,
    y2,
    rad,
    rad,
    style.panelColor,
    style.panelColor,
    false,
  );
  draw_set_alpha((style.borderAlpha ?? 1) * a);
  draw_roundrect_color_ext(
    x1,
    y1,
    x2,
    y2,
    rad,
    rad,
    style.borderColor,
    style.borderColor,
    true,
  );
};

/**
 * Capsule track + fill bar. Pass x1 as `fillTo` for an empty bar; the caller clamps `fillTo`
 * so the rounded caps can't invert. `borderOver` strokes the border over the fill rather than
 * under it. Styles: track { color, border?, borderColor? }, fill { color }.
 */
globalThis.drawUIBar = function drawUIBar(
  x1,
  y1,
  x2,
  y2,
  rad,
  fillTo,
  track,
  fill,
  borderOver,
) {
  const tc = track.color ?? c_dkgray;
  const bc = track.borderColor ?? c_black;
  draw_roundrect_color_ext(x1, y1, x2, y2, rad, rad, tc, tc, false);
  if (track.border && !borderOver)
    draw_roundrect_color_ext(x1, y1, x2, y2, rad, rad, bc, bc, true);
  if (fillTo > x1) {
    const fc = fill.color ?? c_white;
    draw_roundrect_color_ext(x1, y1, fillTo, y2, rad, rad, fc, fc, false);
  }
  if (track.border && borderOver)
    draw_roundrect_color_ext(x1, y1, x2, y2, rad, rad, bc, bc, true);
};

/**
 * Aspect-preserving contain fit of a sw×sh sprite, centered in the (x, y, w, h) box.
 * `maxScale` > 0 caps the scale; 0 = no cap.
 */
globalThis.uiContainRect = function uiContainRect(
  sw,
  sh,
  x,
  y,
  w,
  h,
  maxScale = 0,
) {
  let s = Math.min(w / sw, h / sh);
  if (maxScale > 0) s = Math.min(s, maxScale);
  const dw = sw * s;
  const dh = sh * s;
  return { x: x + (w - dw) / 2, y: y + (h - dh) / 2, w: dw, h: dh };
};

/**
 * The self-size mechanism: a measured content size set as fixed width/height styles, a no-op
 * when unchanged so re-running it never dirties the tree. BUG: measure callbacks are
 * unsupported (docs/GMRT.md).
 */
globalThis.uiResizeTo = function uiResizeTo(element, width, height) {
  if (
    element.getWidth().value != width ||
    element.getHeight().value != height
  ) {
    element.setWidth(width, flexpanel_unit.point);
    element.setHeight(height, flexpanel_unit.point);
  }
};

/**
 * Normalizes a `string | () => string` label into a live fn. Call once at construction, not
 * per frame: it allocates.
 */
globalThis.uiTextRef = function uiTextRef(label) {
  return typeof label === "function" ? label : () => label;
};

/**
 * { name, value }[] item-list accessors: one home for the out-of-range fallbacks, so every
 * list widget's selection contract agrees.
 */
globalThis.uiItemValue = function uiItemValue(items, i) {
  const item = items[i];
  return item ? item.value : undefined;
};

globalThis.uiItemName = function uiItemName(items, i) {
  const item = items[i];
  return item ? item.name : "";
};

/**
 * `w` overrides the stroke width.
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
 * Resolves a widget font option at draw time: a font key resolves live, a raw handle (or
 * -1 = inherit) passes through. Never cache the handle at construction: a locale reload
 * deletes the old handles, and an undeclared key resolves to whatever font is current.
 */
globalThis.resolveUIFont = function resolveUIFont(f) {
  return typeof f === "string" ? I18n.font(f) : f;
};

/**
 * Returns a fresh snapshot rather than filling a shared slot, so nested use can't corrupt it.
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

globalThis.uiDrawRestore = function uiDrawRestore(st) {
  draw_set_font(st.font);
  draw_set_halign(st.halign);
  draw_set_valign(st.valign);
  draw_set_color(st.color);
  draw_set_alpha(st.alpha);
};
