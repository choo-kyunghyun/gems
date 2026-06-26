// Death behaviour: what happens to an entity whose Health reaches 0. An OPT-IN marker — only
// entities carrying a Mortal react in the scene's death pass (RpgScene.resolveHealth), so the
// reaction is configured per spawn preset instead of hardcoded by tag/entity-id. Entities with
// Health but no Mortal (e.g. a built turret, handled by BuildMode.reapDestroyed) are left alone.
//
// Kinds:
//   "despawn"  spill the entity's Inventory as ground drops, then remove it (enemies/enemies).
//   "respawn"  refill Health (to Stats.maxHp, else reviveHp) and reposition (the player).
//   "down"     incapacitate: drop Health (un-targetable), enter a Downed{timer} state for
//              `recoverSecs`, then revive with `reviveHp` at the recovery spot (companions).
/**
 * @typedef {Object} Mortal
 * @property {"despawn"|"respawn"|"down"} kind
 * @property {number} [recoverSecs]  "down": sim-seconds incapacitated before recovery
 * @property {number} [reviveHp]     "down"/"respawn": Health restored on recovery (no Stats.maxHp)
 */
globalThis.Mortal = "Mortal";
