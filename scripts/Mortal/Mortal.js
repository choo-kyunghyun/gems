// opt-in death behaviour. only entities carrying Mortal react in RpgScene.resolveHealth; no Mortal
// = left alone (e.g. built turrets handled by BuildMode.reapDestroyed).
//   "despawn"  spill inventory as drops, then remove
//   "corpse"   strip the combatant in place → lootable body over its Inventory
//              (Interaction "corpse" → StorageUI), reaped when emptied (mobs)
//   "respawn"  refill health and reposition (player)
//   "down"     detach Health → Downed{timer} → revive at recovery spot (companions)
/**
 * @typedef {Object} Mortal
 * @property {"despawn"|"corpse"|"respawn"|"down"} kind
 * @property {number} [recoverSecs]  "down": sim-seconds incapacitated before recovery
 * @property {number} [reviveHp]     "down"/"respawn": Health restored on recovery (no Stats.maxHp)
 */
globalThis.Mortal = "Mortal";
