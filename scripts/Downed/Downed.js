// Incapacitation marker for "down"-kind Mortal entities (companions) — Health is detached while present
// so enemies ignore them; RpgCombat.updateDowned counts `timer` down and revives at 0. Flat scalar.
/**
 * @typedef {Object} Downed
 * @property {number} timer  sim-seconds remaining until the entity recovers
 */
globalThis.Downed = "Downed";
