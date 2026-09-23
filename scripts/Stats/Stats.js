/**
 * Derived combat stats: the caps and factors the combat and survival systems read, each reader
 * with its own default when absent. Deriving it is the game's business. Session-scoped.
 *
 * @typedef {Object} Stats
 * @property {number} maxHp
 * @property {number} maxStamina
 * @property {number} attack
 * @property {number} defense
 * @property {number} speed
 */
globalThis.Stats = "Stats";
