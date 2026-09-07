/**
 * flat foot-shadow ellipse per visible entity; insert BEFORE RenderEntity so shadows sit under sprites.
 * one shared pass keeps art shadow-free and sizes consistent from BBox footprints.
 * Covers both body kinds of the projection contract's flat categories: Visual sprites and
 * Skeleton dolls (an entity carries one or the other, never both — see Skeleton).
 * `filter` is the consumer's per-entity gate (the injection idiom — e.g. only living bodies
 * cast; "living" is the consumer's model, not this pass's).
 * @implements {RenderPass}
 */
globalThis.RenderEntityShadow = class RenderEntityShadow {
  constructor(opt) {
    opt = opt ?? {};
    this.enabled = true;
    this.alpha = opt.alpha ?? 0.26; // shadow darkness
    this.scaleX = opt.scaleX ?? 0.6; // half-width fraction of BBox width
    this.flatten = opt.flatten ?? 0.32; // height/width ratio (low ellipse)
    this.defaultRx = opt.defaultRx ?? 16; // fallback half-width when no BBox
    this.filter = opt.filter; // (entities, id) => cast? — undefined shadows every visible body
    this._rp = { x: 0, y: 0 }; // reused lerp scratch
  }

  destroy() {}

  draw(entities) {
    const prevA = draw_get_alpha();
    draw_set_alpha(this.alpha);
    entities.forEach([Visual, Position], (entity, visual) => {
      if (!visual.visible) return;
      if (this.filter !== undefined && !this.filter(entities, entity)) return;
      this._ellipse(entities, entity);
    });
    entities.forEach([Skeleton, Position], (entity, sk) => {
      if (sk.alpha <= 0) return;
      if (this.filter !== undefined && !this.filter(entities, entity)) return;
      this._ellipse(entities, entity);
    });
    draw_set_alpha(prevA);
  }

  /** one foot ellipse at the entity's render-lerped position, sized from its BBox */
  _ellipse(entities, entity) {
    const rp = InterpolationSystem.lerp(entities, entity, this._rp);
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
