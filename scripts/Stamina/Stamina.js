/**
 * Sprint resource — the mirror of Health (current value here, max in Stats.maxStamina).
 * StaminaSystem drains it while the entity sprints and regenerates it otherwise; the mover
 * (RpgController.update) reads the result to apply the speed boost. An entity without this
 * component can't sprint.
 *
 * @typedef {Object} Stamina
 * @property {number} value      current stamina (0..Stats.maxStamina)
 * @property {boolean} exhausted true once drained to 0 — sprint stays locked out until it
 *                               regenerates back to StaminaSystem.RECOVER of max
 */
globalThis.Stamina = "Stamina";
