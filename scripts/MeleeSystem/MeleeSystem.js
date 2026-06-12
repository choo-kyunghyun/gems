// Melee combat for the platformer. A swing is resolved immediately (no projectile
// entity): an AABB hitbox extends `reach` px from the attacker's front edge in the
// facing direction and applies `damage` to the Health of every Enemy it overlaps.
//
//   const hits = MeleeSystem.swing(world, playerId, ctrl.facing, reach, damage);
//
// Returns the ids of enemies struck (caller may use them for feedback). Enemies at
// <= 0 hp are removed via world.remove (committed by the caller's flush) — the
// scene's death scan then spills their loot, same as a ranged kill. Uses AABB for
// edge geometry (the non-uniform BBox-anchor convention) — never inline pos+box.
globalThis.MeleeSystem = {
  /**
   * @param {object} world
   * @param {number} attackerId
   * @param {number} facing      -1 (left) or +1 (right)
   * @param {number} reach       hitbox length in px, in front of the attacker
   * @param {number} damage      hp subtracted from each overlapped enemy
   * @returns {number[]} ids of enemies hit this swing
   */
  swing(world, attackerId, facing, reach, damage) {
    const a = AABB.of(world, attackerId);
    // Hitbox spans the attacker's full height and extends `reach` from the front
    // edge outward; a small overlap back into the body avoids a dead gap at point
    // blank. `facing` picks which side is "front".
    let box;
    if (facing >= 0) {
      box = { x1: a.cx, y1: a.y1, x2: a.x2 + reach, y2: a.y2 };
    } else {
      box = { x1: a.x1 - reach, y1: a.y1, x2: a.cx, y2: a.y2 };
    }

    const hits = [];
    for (const id of world.query(Enemy, Position, BBox)) {
      const e = AABB.of(world, id);
      if (!AABB.overlap(box, e)) continue;
      const hp = world.get(Health, id);
      if (hp !== undefined) {
        hp.hp -= damage;
        if (hp.hp <= 0) world.remove(id);
      } else {
        world.remove(id);
      }
      hits.push(id);
    }
    return hits;
  },
};
