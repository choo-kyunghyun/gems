/**
 * Health at the last observation — the hp counterpart of PrevPosition: ColonyCombat.trackDamage
 * diffs it to pop a floating number on a change, then re-seeds it. Absent = no baseline yet, so
 * the first observation pops nothing (a spawn, a load, a revive).
 * @typedef {Object} PrevHealth
 * @property {number} hp
 */
globalThis.PrevHealth = "PrevHealth";
