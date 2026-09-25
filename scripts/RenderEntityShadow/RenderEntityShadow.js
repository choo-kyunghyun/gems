/**
 * A flat foot-shadow ellipse per visible Sprite; insert it before the sprite pass so shadows sit
 * under. One shared pass keeps art shadow-free and sizes consistent from the footprint. `filter` is the consumer's per-entity gate: which bodies cast is its model, not this
 * pass's.
 * @implements {RenderPass}
 */
globalThis.RenderEntityShadow = class RenderEntityShadow {
  constructor(opt) {
    opt = opt ?? {};
    this.enabled = true;
    this.alpha = opt.alpha ?? 0.26;
    this.scaleX = opt.scaleX ?? 0.6; // half-width as a fraction of BBox width
    this.flatten = opt.flatten ?? 0.32; // height/width
    this.defaultRx = opt.defaultRx ?? 16; // px half-width without a BBox
    this.filter = opt.filter; // (entities, id) => bool; undefined shadows every visible body
  }

  destroy() {}

  draw(entities) {
    const prevA = draw_get_alpha();
    draw_set_alpha(this.alpha);
    entities.forEach([Sprite, Position], (entity, spr, pos) => {
      if (!spr.visible) return;
      if (spr.alpha <= 0) return;
      if (this.filter !== undefined && !this.filter(entities, entity)) return;
      this._ellipse(entities, entity, pos);
    });
    draw_set_alpha(prevA);
  }

  _ellipse(entities, entity, rp) {
    let rx = this.defaultRx;
    const box = entities.get(entity, BBox);
    if (box !== undefined) rx = box.width * this.scaleX;
    const ry = Math.max(3, rx * this.flatten);
    draw_ellipse_colour(
      rp.x - rx,
      rp.y - ry,
      rp.x + rx,
      rp.y + ry,
      c_black,
      c_black,
      false,
    );
  }
};
