// Instant melee swing (no projectile): an AABB hitbox extends `reach` in the facing direction (snapped
// to 4-way) and damages every overlapping Health except the attacker + faction allies. Subtracts hp only.
globalThis.MeleeSystem = {
  _rect: AABB.rect(), // reused candidate edges (docs/PERF.md)

  /**
   * dirX/dirY: facing (sign matters; the larger magnitude picks the axis). reach: hitbox length
   * in px in front of the attacker. Returns the ids hit this swing.
   */
  swing(entities, attackerId, dirX, dirY, reach, damage) {
    const a = AABB.of(entities, attackerId);
    // hitbox spans the cross-axis, extends `reach` from the front edge; overlaps back to center
    // to avoid a point-blank dead gap. snap to dominant axis → 4-way.
    let box;
    if (Math.abs(dirX) >= Math.abs(dirY)) {
      if (dirX >= 0) box = { x1: a.cx, y1: a.y1, x2: a.x2 + reach, y2: a.y2 };
      else box = { x1: a.x1 - reach, y1: a.y1, x2: a.cx, y2: a.y2 };
    } else {
      if (dirY >= 0) box = { x1: a.x1, y1: a.cy, x2: a.x2, y2: a.y2 + reach };
      else box = { x1: a.x1, y1: a.y1 - reach, x2: a.x2, y2: a.cy };
    }

    const hits = [];
    const e = MeleeSystem._rect;
    entities.forEach([Health, Position, BBox], (id, _hp, pos, bb) => {
      if (id === attackerId) return;
      if (FactionSystem.allied(entities, attackerId, id)) return; // no friendly fire
      AABB.edgesInto(pos, bb, e);
      if (!AABB.overlap(box, e)) return;
      // shared applier mitigates + subtracts; death reaction is central
      Combat.applyDamage(entities, id, damage);
      hits.push(id);
    });
    return hits;
  },
};
