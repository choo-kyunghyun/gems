/**
 * Ring radius is entity[component][field]. colony wires Brain ranges (see ColonyMap). Inserted disabled,
 * toggled via the Debug Render section.
 * @implements {RenderPass}
 */
globalThis.RenderDebugRange = class RenderDebugRange {
  /**
   * opt: ranges ({component,field,color,alpha?}[]), alpha (default ring alpha when a spec omits its
   * own), enabled (start drawn — default false, a toggled overlay).
   */
  constructor(opt = {}) {
    this.enabled = opt.enabled ?? false;
    this.ranges = opt.ranges ?? [];
    this.alpha = opt.alpha ?? 0.5;
    this._rp = { x: 0, y: 0 }; // reused lerp scratch
  }

  destroy() {}

  draw(entities) {
    if (this.ranges.length === 0) return;
    const color = draw_get_color();
    const alpha = draw_get_alpha();
    for (let r = 0; r < this.ranges.length; r++) {
      const spec = this.ranges[r];
      const a = spec.alpha ?? this.alpha;
      const col = spec.color;
      const ids = entities.query(spec.component, Position);
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const radius = entities.get(id, spec.component)[spec.field];
        if (!(radius > 0)) continue; // skip 0/NaN radii
        const rp = InterpolationSystem.lerp(entities, id, this._rp);
        const x = rp.x;
        const y = rp.y;
        draw_set_alpha(a);
        draw_circle_color(x, y, radius, col, col, true);
      }
    }
    draw_set_color(color);
    draw_set_alpha(alpha);
  }
};
