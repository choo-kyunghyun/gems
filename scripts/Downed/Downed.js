// Incapacitated marker for a "down"-kind Mortal entity (a companion brought to 0 Health). Present
// only while downed: its Health is detached (so enemies don't target it and the death scan skips
// it), FollowerSystem holds it still, and RpgScene.updateDowned counts `timer` down each tick —
// at <= 0 it revives (re-add Health, undim, teleport to the recovery spot) and the marker is
// dropped. A flat scalar so it round-trips through EntitySnapshot across a map change.
/**
 * @typedef {Object} Downed
 * @property {number} timer  sim-seconds remaining until the entity recovers
 */
globalThis.Downed = "Downed";
