// Melee combat for the RPG. A swing is resolved immediately (no projectile entity):
// an AABB hitbox extends `reach` px from the attacker's front edge in the facing
// DIRECTION (a vector, snapped to the dominant axis → 4-way) and applies `damage` to
// the Health of every other body it overlaps.
//
//   const hits = MeleeSystem.swing(world, playerId, dir.x, dir.y, reach, damage);
//
// Targets any entity with Health + BBox EXCEPT the attacker and its faction ALLIES (no
// friendly fire — FactionSystem.allied; a target with no faction is still hit, so this is a
// no-op for current content where only the player/slimes carry factions). In the RPG that's
// exactly the slimes (the player is excluded; NPCs/furniture/drops carry no Health), so it
// needs no per-genre "enemy" tag. Returns the ids struck; this only SUBTRACTS hp —
// the death reaction (despawn/respawn/down) is decided centrally by the scene's Mortal-driven
// death pass (RpgScene.resolveHealth), so a melee kill and a ranged kill share one configurable
// path. Uses AABB for edge geometry (the non-uniform BBox-anchor convention) — never inline pos+box.
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
    // Hitbox spans the attacker's cross-axis and extends `reach` from the front edge
    // outward; a small overlap back into the body (from the center) avoids a dead gap at
    // point blank. Snap to the dominant axis so a diagonal aim still reads as a 4-way hit.
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
      // Mitigated + subtracted by the shared Combat applier (defense/floor via the injected hook);
      // only subtracts hp — the death reaction is decided centrally (see below).
      Combat.applyDamage(world, id, damage);
      hits.push(id);
    }
    return hits;
  },
};
