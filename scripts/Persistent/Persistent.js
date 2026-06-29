// Stable authored identity for file-scope reconcile: a level-file spawn carrying an `id` gets
// `Persistent { uid: id }`, and the scene remembers its per-map disposition so a removed unique
// (killed boss, recruited NPC) doesn't re-spawn while id-less spawns do.
/**
 * @typedef {Object} Persistent
 * @property {string} uid  authored, map-stable id from the level file
 */
globalThis.Persistent = "Persistent";
