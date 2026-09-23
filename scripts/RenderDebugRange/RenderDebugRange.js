/**
 * Debug rings around entities, each radius read from entity[component][field]. Starts disabled:
 * a toggled overlay.
 * @implements {RenderPass}
 */
globalThis.RenderDebugRange = class RenderDebugRange {
  /** opt: ranges ({component,field,color,alpha?}[]), alpha (for a spec without its own), enabled. */
  constructor(opt = {}) {
    this.enabled = opt.enabled ?? false;
    this.ranges = opt.ranges ?? [];
    this.alpha = opt.alpha ?? 0.5;
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
        if (!(radius > 0)) continue; // also skips NaN
        const rp = entities.get(id, Position);
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
