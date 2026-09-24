/**
 * @typedef {Object} Projectile
 * @property {number} damage
 * @property {number} owner        the shooter, ignored when raycasting
 * @property {number} penetration  lowers the target's effective defense at the hit
 * @property {boolean} lob         a thrown charge: it stops where it lands, with no impact
 *                                  damage, instead of being spent
 * @property {number} [range]      world px left to fly; absent = unlimited, until impact
 */
globalThis.Projectile = "Projectile";
// any script may load first (docs/GMRT.md)
(globalThis.Blank ??= {})[Projectile] = { penetration: 0, lob: false };
