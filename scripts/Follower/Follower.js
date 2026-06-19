// Companion marker + follow state for the RPG party system. A follower is either:
//   "follow" — travels WITH the player (party scope); RpgMap.go snapshots it on a map
//              change and re-spawns it near the new map's entry (EntitySnapshot).
//   "wait"   — stationed in `homeMap` (map scope); stays resident in that map's parked world
//              (or its cache entry if evicted), in place when the player returns.
// FollowerSystem seeks the player while following; SolidSystem integrates + collides the body
// (it's a dynamic solid). The player id is passed to the system per tick, never stored here,
// so a migrated follower needs no entity-id re-link.
//
// A companion also helps CARRY: while it is following, FollowerSystem.applyBenefit adds its
// `bonusCapacity`/`bonusWeight` to the player's Inventory (a balanced +/- delta, like
// EquipmentSystem's Container bonus). The bonus is applied/removed at each follow-state
// transition (seed/F-toggle/dismiss), so it rides the carried Inventory snapshot across a map
// change with no re-apply — exactly the equip/unequip-pair invariant.
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
