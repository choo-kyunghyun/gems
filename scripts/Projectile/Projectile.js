/**
 * @typedef {Object} Projectile
 * @property {number} damage       applied to a hit entity's Health, if it has one
 * @property {number} owner        entity id to ignore when raycasting (the shooter)
 * @property {number} [penetration] armor penetration — lowers the target's effective defense at the
 *                                  hit (Combat.mitigate). Default 0 (inert) for turrets / melee.
 * @property {boolean} [lob]       a thrown charge: it STOPS where it lands — its range spent, or
 *                                  against the first collider, with no impact damage — instead of
 *                                  being spent; what follows is its Fuse's. Default false (a bullet).
 * @property {number} [range]      world px left to fly; ProjectileSystem spends it per tick and ends
 *                                  the flight at 0 (a lob lands, a bullet is dropped). Absent =
 *                                  unlimited, until impact.
 */
globalThis.Projectile = "Projectile";
