// Companion marker + follow state. "follow" = party scope (RpgMap.go snapshots + re-spawns it across a map
// change); "wait" = map scope (stays resident in homeMap's parked world). player id passed to the system per
// tick, never stored here — a migrated follower needs no entity-id re-link.
// Carry bonus: while following, FollowerSystem.applyBenefit adds bonusCapacity/bonusWeight to the player's
// Inventory (balanced +/- delta at each follow-state transition), so it rides the carried snapshot with no
// re-apply — the equip/unequip-pair invariant.
/**
 * @typedef {Object} Follower
 * @property {"follow"|"wait"} state
 * @property {number} speed          move speed (px/s) while following
 * @property {number} range          stop distance (px) from the player
 * @property {string} homeMap        mapId it's stationed in while waiting ("" while following)
 * @property {number} bonusCapacity  extra Inventory slots granted to the player while following
 * @property {number} bonusWeight    extra Inventory maxWeight granted while following
 */
globalThis.Follower = "Follower";
