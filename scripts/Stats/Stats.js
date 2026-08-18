/**
 * Derived combat stats — the caps/factors the combat/survival systems read (StaminaSystem, StatusSystem,
 * ConsumableSystem, movers), with per-reader defaults when absent. Deriving it is the GAME's
 * business: the demo rebuilds it from Attributes via StatModel. Session-scoped.
 *
 * @typedef {Object} Stats
 * @property {number} maxHp
 * @property {number} maxStamina
 * @property {number} attack
 * @property {number} defense
 * @property {number} speed
 */
globalThis.Stats = "Stats";
