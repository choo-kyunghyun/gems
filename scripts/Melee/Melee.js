// Instant melee swing (no projectile): an AABB hitbox extends `reach` in the facing direction (snapped
// to 4-way) and damages every Health whose MASK it overlaps — the runtime's rect query over the
// mirrors (Query.maskRect), so a hit is as of this tick's PuppetSystem.update and a solid-off body
// (a corpse, which carries no Health anyway) is never hit. Skips the attacker + faction allies.
// Subtracts hp only.
globalThis.Melee = {
  /**
   * dirX/dirY: facing (sign matters; the larger magnitude picks the axis). reach: hitbox length
   * in px in front of the attacker. Returns the ids hit this swing.
   */
  swing(entities, attackerId, dirX, dirY, reach, damage) {
    const a = AABB.of(entities, attackerId);
    // hitbox spans the cross-axis, extends `reach` from the front edge; overlaps back to center
    // to avoid a point-blank dead gap. snap to dominant axis → 4-way.
    let x1, y1, x2, y2;
    if (Math.abs(dirX) >= Math.abs(dirY)) {
      y1 = a.y1;
      y2 = a.y2;
      if (dirX >= 0) {
        x1 = a.cx;
        x2 = a.x2 + reach;
      } else {
        x1 = a.x1 - reach;
        x2 = a.cx;
      }
    } else {
      x1 = a.x1;
      x2 = a.x2;
      if (dirY >= 0) {
        y1 = a.cy;
        y2 = a.y2 + reach;
      } else {
        y1 = a.y1 - reach;
        y2 = a.cy;
      }
    }

    const hits = [];
    const ids = Query.maskRect(entities, x1, y1, x2, y2, { has: Health });
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id === attackerId) continue;
      if (Diplomacy.allied(entities, attackerId, id)) continue; // no friendly fire
      // shared applier mitigates + subtracts; death reaction is central
      Combat.applyDamage(entities, id, damage);
      hits.push(id);
    }
    return hits;
  },
};
