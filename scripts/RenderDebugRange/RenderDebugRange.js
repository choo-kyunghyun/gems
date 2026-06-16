// Debug overlay: draws each entity's "active range" as a world-space ring — a turret's fire
// radius, a slime's aggro / give-up / attack distances — so behavior tuning is visible at a
// glance. A generic Core pass: it knows nothing about specific components; the scene supplies a
// list of { component, field, color } specs, and for every entity carrying `component` it draws a
// ring of radius `entity[component][field]` around the (interpolated) Position. The RPG scene
// configures it with Turret/Brain (see RpgMap); other genres can reuse it with their own ranges.
//
// Inserted disabled and toggled live via the Debug "Render" panel (DebugRender), like the other
// debug overlays. Rings interpolate via PrevPosition + world.alpha so they track the drawn boxes.
//
// @implements {RenderPass}
globalThis.RenderDebugRange = class RenderDebugRange {
  /**
   * @param {Object} [opt]
   * @param {{component:string,field:string,color:number,alpha?:number}[]} [opt.ranges]
   * @param {number} [opt.alpha]    default ring alpha when a spec omits its own
   * @param {boolean} [opt.enabled] start drawn (default false — a toggled overlay)
   */
  constructor(opt = {}) {
    this.enabled = opt.enabled ?? false;
    this.ranges = opt.ranges ?? [];
    this.alpha = opt.alpha ?? 0.5;
    this._rp = { x: 0, y: 0 }; // reused interp scratch (no per-entity alloc)
  }

  destroy() {}

  draw(world) {
    if (this.ranges.length === 0) return;
    const color = draw_get_color();
    const alpha = draw_get_alpha();
    for (let r = 0; r < this.ranges.length; r++) {
      const spec = this.ranges[r];
      const a = spec.alpha ?? this.alpha;
      const col = spec.color;
      const ids = world.query(spec.component, Position);
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const radius = world.get(spec.component, id)[spec.field];
        if (!(radius > 0)) continue; // skip 0 / NaN (uncomputed) radii
        const rp = InterpolationSystem.lerp(world, id, this._rp);
        const x = rp.x;
        const y = rp.y;
        draw_set_alpha(a);
        // draw_circle_color (probe-verified on GMRT 0.20); outline ring, same hue in/out.
        draw_circle_color(x, y, radius, col, col, true);
      }
    }
    draw_set_color(color);
    draw_set_alpha(alpha);
  }
};
