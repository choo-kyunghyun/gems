/**
 * @implements {UIComponent}
 * Sprite-skinned panel background — UIPanel sibling using hand-drawn art. Source sprite must have
 * IDE nine-slice enabled so draw_sprite_stretched_ext scales edges/center without distorting the
 * border (see spr_uibox, insets 3px). Non-interactive; add as a low-index component so it sits
 * behind content.
 *
 * GMRT: guard `!(pos.width > 0)` — the first frame after a scene transition has no layout, so
 * getLayoutPosition() returns NaN and a stretched draw at NaN faults. Test `> 0` (NaN <= 0 is false).
 */
globalThis.UINineSlice = class UINineSlice {
  /** @param {Object} [slice] { sprite, subimg, color, alpha } — sprite must have IDE nine-slice enabled */
  constructor(slice = {}) {
    this.sprite = slice.sprite;
    this.subimg = slice.subimg ?? 0;
    this.color = slice.color ?? c_white; // tint
    this.alpha = slice.alpha ?? 1;
  }

  /** @param {UIElement} element */
  onDraw(element) {
    if (!sprite_exists(this.sprite)) return;
    const pos = element.getLayoutPosition();
    if (!(pos.width > 0)) return; // unlaid-out (NaN) or zero-width — NaN <= 0 is false

    // IDE nine-slice data makes this stretch corner-safe.
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
