// Instant melee swing (no projectile): an AABB hitbox extends `reach` in the facing direction
// (snapped to dominant axis → 4-way) and damages every overlapping Health except the attacker
// and its faction allies (no friendly fire). Only subtracts hp — death reaction is central
// (RpgScene.resolveHealth). Uses AABB for edge geometry (non-uniform BBox anchor) — never inline pos+box.
globalThis.MeleeSystem = {
  /**
   * @param {object} world
   * @param {number} attackerId
   * @param {number} dirX        facing x (sign matters; magnitude vs dirY picks the axis)
   * @param {number} dirY        facing y
   * @param {number} reach       hitbox length in px, in front of the attacker
   * @param {number} damage      hp subtracted from each overlapped body
   * @returns {number[]} ids hit this swing
   */
  swing(world, attackerId, dirX, dirY, reach, damage) {
    const a = AABB.of(world, attackerId);
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
    for (const id of world.query(Health, Position, BBox)) {
      if (id === attackerId) continue;
      if (FactionSystem.allied(world, attackerId, id)) continue; // no friendly fire
      const e = AABB.of(world, id);
      if (!AABB.overlap(box, e)) continue;
      // shared applier mitigates + subtracts; death reaction is central
      Combat.applyDamage(world, id, damage);
      hits.push(id);
    }
    return hits;
  },
};
