/**
 * Sprint resource — the falling meter (a need rises): current value here, max in Stats.maxStamina,
 * and its rates as per-entity data like a need's, so a trait or an attribute can move them.
 * Without it an entity can't sprint.
 * @typedef {Object} Stamina
 * @property {number} value      current stamina (0..Stats.maxStamina)
 * @property {boolean} exhausted drained to 0 — sprint locked out until regen reaches `recover` of max
 * @property {number} drain      stamina/sec spent while sprinting
 * @property {number} regen      stamina/sec recovered while not sprinting
 * @property {number} recover    fraction of max that unlocks sprint again after an exhaustion
 */
globalThis.Stamina = "Stamina";
