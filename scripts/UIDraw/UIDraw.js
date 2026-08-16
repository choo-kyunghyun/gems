// Shared widget primitives — glyph draws (arrow/check/outline/bar), draw-state save/restore, and the
// update-time idioms every widget repeats (font/text, pointer latch, contain fit, self-size). One home.

/**
 * filled triangle pointing `dir`, centered at (cx, cy), half-size `h`. draw_triangle_color
 * (renders on GMRT 0.20).
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
 * the ◀ ▶ pair chrome shared by UISelect/UIStepper: arrows inset a fixed pad from each
 * end, at the row's vertical center. The caller supplies per-arrow colors (hover vs
 * disabled dimming differs) and draws its own centered label at the returned cy.
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
 * which half of `element` the pointer is over: -1 left / +1 right / 0 not hovering (or
 * blocked). The ◀/▶ side latch UISelect/UIStepper stash BEFORE running their FSM, so the
 * release-edge onClick commits from the same frame's side.
 */
globalThis.uiPointerSide = function uiPointerSide(element, block) {
  if (block) return 0;
  const mx = device_mouse_x_to_gui(0);
  if (!element.positionMeeting(mx, device_mouse_y_to_gui(0))) return 0;
  const pos = element.getLayoutPosition();
  return mx < pos.left + pos.width * 0.5 ? -1 : 1;
};

/**
 * fake-thickness outline: `thick` nested 1px roundrect strokes insetting inward (GM
 * roundrect outlines are always 1px). Shared by UIPanel's border, the UISlider thumb ring,
 * UISlots' selection, UIRebind's armed ring, and UINav's focus ring (which passes its
 * outer rect so the inward insets land on the same pixels as its old outward growth).
 * `rad` is constant across insets.
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
 * rounded panel + 1px border — the chrome the GUI singletons (Tooltip/Toast/Dialogue) draw
 * around themselves, outside the UIElement tree where a gems* factory can't reach. `style`
 * supplies the four fields the singletons already hold ({ panelColor, panelAlpha, borderColor,
 * borderAlpha? }), so each can pass itself; `a` scales BOTH alphas (Toast's fade). Leaves the
 * draw alpha at the border's — every caller restores its own draw state.
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
 * capsule track + fill bar — the shared body of UISlider and UIProgress. Draws the track
 * roundrect, the fill from x1 to `fillTo` (skipped when fillTo <= x1 — pass x1 for an
 * empty bar; the CALLER clamps fillTo so the rounded caps can't invert), and the 1px
 * border when `track.border` is set. `borderOver` picks the stacking: UIProgress strokes
 * the border OVER the fill (frames the whole track); UISlider strokes it under (the fill
 * covers its left span). Styles: track { color, border?, borderColor? },
 * fill { color, color2? } (color2 = roundrect's center→edge tint, not a gradient).
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
    const fc2 = fill.color2 ?? fc;
    draw_roundrect_color_ext(x1, y1, fillTo, y2, rad, rad, fc, fc2, false);
  }
  if (track.border && borderOver)
    draw_roundrect_color_ext(x1, y1, x2, y2, rad, rad, bc, bc, true);
};

/**
 * aspect-preserving CONTAIN fit: scale a sw×sh sprite into the (x, y, w, h) box and
 * center it — the draw rect for draw_sprite_stretched_ext. Shared by UIImage
 * (CONTAIN/SCALE_DOWN) and UISlots' cell icons. `maxScale` > 0 additionally caps the
 * scale (SCALE_DOWN); 0 = no cap.
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
 * flexpanel self-size: apply a measured content size to the element's fixed width/height
 * styles, as a no-op when unchanged so re-running it never dirties the tree. THE
 * style-mutation self-size mechanism (measure callbacks are unsupported on GMRT —
 * docs/GMRT.md → Known Incompatibilities); setWidth/setHeight mark the root dirty themselves.
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
 * normalize a `string | () => string` label into a live textRef fn — the Core twin of
 * gemsTextRef (which delegates here), reachable by Core widgets (UITooltip/UIProgress/
 * UIRebind). Normalize once at construction; don't call per frame (it allocates).
 */
globalThis.uiTextRef = function uiTextRef(label) {
  return typeof label === "function" ? label : () => label;
};

/**
 * the { name, value }[] item-list accessors shared by UISelect/UIDropdown — one home for
 * the out-of-range fallbacks (value → undefined, name → ""), so the two widgets' selection
 * contracts can't drift. The list/index stay plain fields on the widgets (consumers read
 * `dropdown.items` directly).
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
 * checkmark (two width-lines) centered at (cx, cy), scaled by `s`; `w` overrides the stroke
 * width. draw_line_width_color (renders on GMRT 0.20).
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
 * this, so the GemsUI convention of passing key strings works uniformly. NEVER cache the
 * handle at construction: besides the dangle, I18n.font falls back to draw_get_font() for an
 * undeclared key, so a construction-time resolve can freeze whatever font happened to be set.
 * (World-space render passes are the deliberate exception — they take a handle and rebuild on
 * map reload, not on a locale switch.)
 */
globalThis.resolveUIFont = function resolveUIFont(f) {
  return typeof f === "string" ? I18n.font(f) : f;
};

/**
 * capture the draw-state quintet a widget onDraw mutates; pair with uiDrawRestore.
 * Stateless — returns a plain snapshot object — so sequential/nested use can't corrupt
 * a shared slot.
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
 */
globalThis.uiDrawRestore = function uiDrawRestore(st) {
  draw_set_font(st.font);
  draw_set_halign(st.halign);
  draw_set_valign(st.valign);
  draw_set_color(st.color);
  draw_set_alpha(st.alpha);
};
