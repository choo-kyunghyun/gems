/**
 * @implements {UIComponent}
 * Sprite-skinned panel background — a UIPanel sibling that wears hand-drawn art
 * instead of draw_roundrect. The source sprite must have nine-slice enabled in the
 * IDE (Sprite Editor → Nine Slice); draw_sprite_stretched_ext then keeps the
 * corners fixed and stretches only the edges/center to the element's size, so the
 * frame scales without distorting its border (see spr_uibox, insets 3px).
 *
 * Non-interactive, like UIPanel — it only draws, so onUpdate is omitted. Add it as
 * a low-index component so it sits behind the element's content.
 *
 * GMRT note: guard `!(pos.width > 0)` before drawing. On the first frame after a
 * scene transition the flexpanel layout isn't computed, so getLayoutPosition()
 * returns NaN width/height and a stretched sprite draw at NaN coords faults. Test
 * `> 0`, not `<= 0` — `NaN <= 0` is false, so the naive guard misses it.
 */
globalThis.UINineSlice = class UINineSlice {
  constructor(slice = {}) {
    this.sprite = slice.sprite;
    this.subimg = slice.subimg ?? 0;
    this.color = slice.color ?? c_white; // tint
    this.alpha = slice.alpha ?? 1;
  }

  onDraw(element) {
    if (!sprite_exists(this.sprite)) return;
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return; // unlaid-out (NaN) or zero-width — NaN <= 0 is false

    // The sprite's IDE nine-slice data makes this stretch corner-safe.
    draw_sprite_stretched_ext(
      this.sprite,
      this.subimg,
      pos.left,
      pos.top,
      pos.width,
      pos.height,
      this.color,
      this.alpha,
    );
  }
};
