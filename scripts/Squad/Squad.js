// Squad MEMBERSHIP — entities sharing a squad id travel together: a portal transfers every
// member (player included, whole entities via World.levels) to the destination map. The player
// mints the id at spawn (RpgPlayer.spawn); FollowerSystem.hire/kick attach/detach membership on
// companions. A companion WITHOUT Squad is a map resident (kicked/unhired — re-hired by talking,
// the "rehire" InteractAction). Flat scalar data — EntitySnapshot/world.export-safe.
/**
 * @typedef {Object} Squad
 * @property {string} id  squad identity — members match by this value (uuid, minted per player)
 */
globalThis.Squad = "Squad";
