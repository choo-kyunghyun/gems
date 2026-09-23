/**
 * Edge arrows pointing at tracked entities around a target. A rule is { has, where?, color }: the
 * arrow shows in that colour when the entity has the component `has` and, with `where(comp)`, the
 * predicate accepts its data. World-space immediate mode, drawn after the renderer; reads entities
 * live, so no rebuild across a map swap. Rule colours are GM colour ints.
 */
globalThis.RadarArrows = {
  /** The first matching rule wins. opt: { range, ring, near, far, lift }. */
  draw(entities, target, rules, opt = {}) {
    const tp = entities.get(target, Position);
    if (tp === undefined) return;
    const range = opt.range ?? 460;
    const ring = opt.ring ?? 52; // world px from the target to each arrow
    const near = opt.near ?? 22; // arrow length at the target
    const far = opt.far ?? 10; // arrow length at the radar edge
    const lift = opt.lift ?? 0; // world-z to raise the ring off the floor (0 = flat)

    const color = draw_get_color();
    const alpha = draw_get_alpha();

    // Depth test off so a body never hides an arrow. Arrows stay in the horizontal plane: upright
    // they would point at the un-foreshortened azimuth and miss.
    if (lift !== 0) {
      gpu_set_ztestenable(false);
      matrix_set(matrix_world, matrix_build(0, 0, -lift, 0, 0, 0, 1, 1, 1));
    }

    const ids = Query.inCircle(entities, tp.x, tp.y, range);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id === target) continue;
      const col = RadarArrows._color(entities, id, rules);
      if (col === null) continue;
      const p = entities.get(id, Position);
      const dx = p.x - tp.x;
      const dy = p.y - tp.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue; // no meaningful direction
      const nx = dx / dist;
      const ny = dy / dist;
      const t = dist / range; // 0..1 within the cull
      const size = near + (far - near) * t;
      draw_set_alpha(1 - 0.45 * t);
      RadarArrows._arrow(tp.x + nx * ring, tp.y + ny * ring, nx, ny, size, col);
    }

    if (lift !== 0) {
      matrix_set(matrix_world, matrix_build_identity());
      gpu_set_ztestenable(true);
    }
    draw_set_color(color);
    draw_set_alpha(alpha);
  },

  /** Pointing along unit (nx,ny), `size` long. */
  _arrow(ax, ay, nx, ny, size, col) {
    const px = -ny;
    const py = nx;
    const w = size * 0.6; // base half-width
    const tipX = ax + nx * size * 0.85;
    const tipY = ay + ny * size * 0.85;
    const bx = ax - nx * size * 0.45; // base center (behind the ring point)
    const by = ay - ny * size * 0.45;
    draw_triangle_color(
      tipX,
      tipY,
      bx + px * w,
      by + py * w,
      bx - px * w,
      by - py * w,
      col,
      col,
      col,
      false,
    );
  },

  _color(entities, id, rules) {
    for (let r = 0; r < rules.length; r++) {
      const rule = rules[r];
      if (!entities.has(id, rule.has)) continue;
      if (rule.where !== undefined && !rule.where(entities.get(id, rule.has)))
        continue;
      return rule.color;
    }
    return null;
  },
};
