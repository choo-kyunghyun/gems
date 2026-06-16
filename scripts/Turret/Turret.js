// Auto-firing defense turret for the RPG (a buildable structure). A string-token component
// holding the turret's attack profile + cooldown; TurretSystem reads it each tick, picks the
// nearest HOSTILE body in `range` (FactionSystem.nearestHostile — so the faction relations are
// what make it shoot slimes and ignore the player/companions), and fires a "bullet" projectile.
//
// A built turret pairs this with Health + Faction{id:"player"}, so slimes treat it as a hostile
// target too (two-sided combat) and can destroy it. All components round-trip through
// EntitySnapshot, so a placed turret persists across map reloads like any built entity.
//
// usage: world.add(id, Turret, { range: 220, fireCd: 30, cd: 0, damage: 2, bulletSpeed: 380 })
/**
 * @typedef {Object} Turret
 * @property {number} range        targeting radius in world px
 * @property {number} fireCd       ticks between shots
 * @property {number} cd           shot cooldown countdown (0 = ready)
 * @property {number} damage       Projectile.damage of each shot
 * @property {number} bulletSpeed  shot speed in px/s
 */
globalThis.Turret = "Turret";
