/**
 * Per-entity character sheet. Lives in the world (session-scoped, not persisted).
 *
 * @typedef {Object} Stats
 * @property {number} level
 * @property {number} xp
 * @property {number} xpNext   xp needed to reach the next level
 * @property {number} maxHp
 * @property {number} attack
 * @property {number} defense
 * @property {number} speed
 */
globalThis.Stats = "Stats";
