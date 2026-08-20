/**
 * @implements {UIComponent}
 * Sprite-skinned panel background — UIPanel sibling using hand-drawn art. Source sprite must have
 * IDE nine-slice enabled so draw_sprite_stretched_ext scales edges/center without distorting the
 * border (see pixUiBox, insets 3px). Non-interactive; add as a low-index component so it sits
 * behind content. Layout is always computed before components run (the central layout
 * guarantee — see UI.insert/UI.draw), so no NaN guard is needed here.
 */
globalThis.UINineSlice = class UINineSlice {
  /** slice: { sprite, subimg, color, alpha } — sprite must have IDE nine-slice enabled */
  constructor(slice = {}) {
    this.sprite = slice.sprite;
    this.subimg = slice.subimg ?? 0;
    this.color = slice.color ?? c_white; // tint
    this.alpha = slice.alpha ?? 1;
  }

  onDraw(element) {
    if (!sprite_exists(this.sprite)) return;
    const pos = element.getLayoutPosition();
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
