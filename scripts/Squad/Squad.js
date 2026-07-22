// Squad MEMBERSHIP — entities sharing a squad id travel together (a portal transfers every member,
// player included, via World.levels). Minted at RpgPlayer.spawn; FollowerSystem.hire/kick attach/detach.
/**
 * @typedef {Object} Squad
 * @property {string} id  squad identity — members match by this value (uuid, minted per player)
 */
globalThis.Squad = "Squad";
