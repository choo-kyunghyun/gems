// Player-centered directional radar — a ring of arrows around the player, one per nearby entity,
// pointing at it, colored by the first matching rule, sized by distance. Contract on the declaration below.
/**
 * A rule is { has, color }: `has` is a COMPONENT TOKEN — the arrow shows (and takes that color) when
 * the entity has that component. World-space immediate-mode; draw() from a level's draw() after
 * renderer.draw(). Reads entities live, so no rebuild across a map swap. Rule colors must be GM colour ints.
 */
globalThis.RadarArrows = {
  /**
   * @param {object} entities
   * @param {number} target  center entity id (the player) — skipped
   * @param {{has:string,color:number}[]} rules  first entity-has-component rule wins
   * @param {object} [opt]  { range, ring, near, far, lift } — lift is the 2.5D world-z (0 = flat)
   */
  draw(entities, target, rules, opt = {}) {
    const tp = entities.get(Position, target);
    if (tp === undefined) return; // target gone — nothing to center on
    const range = opt.range ?? 460;
    const ring = opt.ring ?? 52; // world px from player to each arrow
    const near = opt.near ?? 22; // arrow length at the player
    const far = opt.far ?? 10; // arrow length at the radar edge
    const lift = opt.lift ?? 0; // 2.5D: world-z to raise the ring off the floor (0 = flat)

    const color = draw_get_color();
    const alpha = draw_get_alpha();

    // 2.5D: lift the ring to ~body height (else it lies splayed flat at the player's feet) and draw
    // depth-test OFF so an arrow is never hidden by a body (always-visible HUD cue). arrows stay in
    // the horizontal plane so each keeps pointing at its target's on-screen position; billboarding
    // them upright would point at the un-foreshortened azimuth and miss.
    if (lift !== 0) {
      gpu_set_ztestenable(false);
      matrix_set(matrix_world, matrix_build(0, 0, -lift, 0, 0, 0, 1, 1, 1));
    }

    const ids = Query.inRadius(entities, tp.x, tp.y, range);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id === target) continue;
      const col = RadarArrows._color(entities, id, rules);
      if (col === null) continue; // no matching rule — not tracked
      const p = entities.get(Position, id);
      const dx = p.x - tp.x;
      const dy = p.y - tp.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue; // on top of the player — no meaningful direction
      const nx = dx / dist;
      const ny = dy / dist;
      const t = dist / range; // 0 near → 1 far (clamped by the inRadius cull)
      const size = near + (far - near) * t; // far → smaller
      draw_set_alpha(1 - 0.45 * t); // far → dimmer
      RadarArrows._arrow(tp.x + nx * ring, tp.y + ny * ring, nx, ny, size, col);
    }

    if (lift !== 0) {
      matrix_set(matrix_world, matrix_build_identity());
      gpu_set_ztestenable(true); // restore the global default (depth test on)
    }
    draw_set_color(color);
    draw_set_alpha(alpha);
  },

  /**
   * filled triangle at (ax,ay) pointing along unit (nx,ny), `size` long
   * @param {number} ax
   * @param {number} ay
   * @param {number} nx
   * @param {number} ny
   * @param {number} size
   * @param {number} col
   */
  _arrow(ax, ay, nx, ny, size, col) {
    const px = -ny; // unit perpendicular
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

  /**
   * @param {Entity} entities
   * @param {number} id
   * @param {{has:string,color:number}[]} rules
   * @returns {number|null}
   */
  _color(entities, id, rules) {
    for (let r = 0; r < rules.length; r++)
      if (entities.get(rules[r].has, id) !== undefined) return rules[r].color;
    return null;
  },
};
