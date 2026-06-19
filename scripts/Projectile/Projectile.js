/**
 * @typedef {Object} Projectile
 * @property {number} damage       applied to a hit entity's Health, if it has one
 * @property {number} owner        entity id to ignore when raycasting (the shooter)
 * @property {number} [penetration] armor penetration — lowers the target's effective defense at the
 *                                  hit (Combat.mitigate). Default 0 (inert) for turrets / melee.
 */
globalThis.Projectile = "Projectile";
