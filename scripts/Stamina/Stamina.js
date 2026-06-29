/**
 * Sprint resource — current value here, max in Stats.maxStamina. Without it an entity can't sprint.
 * @typedef {Object} Stamina
 * @property {number} value      current stamina (0..Stats.maxStamina)
 * @property {boolean} exhausted drained to 0 — sprint locked out until regen reaches RECOVER of max
 */
globalThis.Stamina = "Stamina";
