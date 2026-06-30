// incapacitation marker for "down"-kind Mortal entities (companions). Health is detached while
// present so enemies ignore them; RpgScene.updateDowned counts timer down and revives at 0.
// flat scalar so it round-trips through EntitySnapshot across map changes.
/**
 * @typedef {Object} Downed
 * @property {number} timer  sim-seconds remaining until the entity recovers
 */
globalThis.Downed = "Downed";
