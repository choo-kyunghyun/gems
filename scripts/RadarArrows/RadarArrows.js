// Player-centered directional radar — the "modern minimap": instead of a corner blip view, it
// draws a ring of rounded arrows AROUND a target entity (the player), one per nearby entity,
// each pointing toward that entity, colored by the first matching tag rule, and SIZED by
// distance (near = big, far = small). So the player reads nearby/moving threats from the center
// of the action without glancing at a corner radar.
//
// World-space, immediate-mode (reads the World live each frame like UIMinimap/RpgWorldOverlay):
// call RadarArrows.draw(world, target, rules, opt) from a scene's draw() AFTER renderer.draw()
// (inside the camera view), so the arrows sit bright over the scene with the other world cues.
// Because it reads world/target live, it needs no rebuild across a map/world swap.
//
// GMRT: draw_triangle_color is 0.20-safe (each arrow = one filled triangle). Tag membership
// via Set.has() (only for...of over a Set is banned). `rules` colors must be GM colour ints
// (parse hex with Color.parse at the call site).
globalThis.RadarArrows = {
  /**
   * @param {object} world
   * @param {number} target           center entity id (the player) — its arrows are skipped
   * @param {{tag:string,color:number}[]} rules  first matching tag wins; others are not drawn
   * @param {object} [opt]  { range, ring, near, far } — detect radius, ring px from the player,
   *                        and arrow length at point-blank (near) vs at max range (far)
   */
  draw(world, target, rules, opt = {}) {
    const tp = world.get(Position, target);
    if (tp === undefined) return; // target gone — nothing to center on
    const range = opt.range ?? 460;
    const ring = opt.ring ?? 52; // world px from the player to each arrow
    const near = opt.near ?? 22; // arrow length at the player
    const far = opt.far ?? 9; // arrow length at the radar edge

    const color = draw_get_color();
    const alpha = draw_get_alpha();

    const ids = Query.inRadius(world, tp.x, tp.y, range);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id === target) continue;
      const col = RadarArrows._color(world, id, rules);
      if (col === null) continue; // no matching rule — not tracked
      const p = world.get(Position, id);
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

    draw_set_color(color);
    draw_set_alpha(alpha);
  },

  // An arrow at (ax, ay) pointing along unit (nx, ny), `size` long: a filled triangle from a
  // base behind the ring point to a tip ahead of it.
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

  _color(world, id, rules) {
    const tag = world.get(Tag, id);
    if (tag === undefined) return null;
    for (let r = 0; r < rules.length; r++)
      if (tag.tags.has(rules[r].tag)) return rules[r].color;
    return null;
  },
};
