// Instant melee swing (no projectile): the weapon's hitbox rect, placed off the attacker's AABB centre
// and mirrored left/right by its facing, damages every Health whose MASK it overlaps — the runtime's
// rect query over the mirrors (Query.maskRect), so a hit is as of this tick's PuppetSystem.update and
// a solid-off body (a corpse, which carries no Health anyway) is never hit. Skips the attacker +
// faction allies. Subtracts hp only.
/**
 * @typedef {object} MeleeHitbox
 * @property {number} width   px
 * @property {number} height  px
 * @property {number} xoffset px from the attacker's centre to the hitbox's centre, facing right
 * @property {number} yoffset px, not mirrored
 */
globalThis.Melee = {
  /**
   * facing: the sign picks the side (< 0 left, else right). Returns the ids hit this swing.
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
      if (Diplomacy.allied(entities, attackerId, id)) continue; // no friendly fire
      // shared applier mitigates + subtracts; death reaction is central
      Combat.applyDamage(entities, id, damage);
      hits.push(id);
    }
    return hits;
  },

  /** The hitbox's front edge, px from the attacker's centre — the "reach" a stat line shows. */
  reach(hitbox) {
    return hitbox.xoffset + hitbox.width * 0.5;
  },
};
