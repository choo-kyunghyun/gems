/**
 * Instant melee swing over the weapon's hitbox.
 * @typedef {object} MeleeHitbox
 * @property {number} width   px
 * @property {number} height  px
 * @property {number} xoffset px from the attacker's centre to the hitbox's centre, facing right
 * @property {number} yoffset px, not mirrored
 */
globalThis.Melee = {
  /**
   * `facing` < 0 swings left, else right. Returns the ids hit.
   * @param {MeleeHitbox} hitbox
   */
  swing(entities, attackerId, facing, hitbox, damage) {
    const a = AABB.of(entities, attackerId);
    const cx = a.cx + (facing < 0 ? -hitbox.xoffset : hitbox.xoffset);
    const cy = a.cy + hitbox.yoffset;
    const hw = hitbox.width * 0.5;
    const hh = hitbox.height * 0.5;

    const hits = [];
    const ids = Query.maskRect(entities, cx - hw, cy - hh, cx + hw, cy + hh, {
      has: Health,
      ignore: attackerId,
    });
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (Diplomacy.allied(entities, attackerId, id)) continue;
      Combat.applyDamage(entities, id, damage);
      hits.push(id);
    }
    return hits;
  },

  /** The hitbox's front edge, px from the attacker's centre. */
  reach(hitbox) {
    return hitbox.xoffset + hitbox.width * 0.5;
  },
};
