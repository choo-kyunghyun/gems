/**
 * Per-entity character sheet — the DERIVED combat stats (from Attributes via StatModel).
 * Lives in the world (session-scoped, not persisted). No level/xp: the RPG is item- +
 * skill-driven, not playtime-driven — permanent growth comes from equipment and
 * attribute-granting consumables, never an XP grind.
 *
 * @typedef {Object} Stats
 * @property {number} maxHp
 * @property {number} maxStamina
 * @property {number} attack
 * @property {number} defense
 * @property {number} speed
 */
globalThis.Stats = "Stats";
