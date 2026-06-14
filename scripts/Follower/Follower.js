// Companion marker + follow state for the RPG party system. A follower is either:
//   "follow" — travels WITH the player (party scope); sceneRpg.loadMap snapshots it on a map
//              change and re-spawns it near the new map's entry (EntitySnapshot).
//   "wait"   — stationed in `homeMap` (map scope); cached in that map's persistence entry and
//              re-spawned where it was left when the player returns.
// FollowerSystem seeks the player while following; SolidSystem integrates + collides the body
// (it's a dynamic solid). The player id is passed to the system per tick, never stored here,
// so a migrated follower needs no entity-id re-link.
globalThis.Follower = "Follower";
/**
 * @typedef {Object} Follower
 * @property {"follow"|"wait"} state
 * @property {number} speed    move speed (px/s) while following
 * @property {number} range    stop distance (px) from the player
 * @property {string} homeMap  mapId it's stationed in while waiting ("" while following)
 */
