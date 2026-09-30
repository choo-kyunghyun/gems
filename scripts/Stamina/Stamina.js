/**
 * Dodge resource — the falling meter (a need rises): current value here, max in Stats.maxStamina,
 * and its rates as per-entity data like a need's, so a trait or an attribute can move them.
 * Without it an entity can't dodge.
 * @typedef {Object} Stamina
 * @property {number} value current stamina (0..Stats.maxStamina)
 * @property {number} cost  stamina one dodge spends
 * @property {number} regen stamina/sec recovered
 */
globalThis.Stamina = "Stamina";
