// Stable authored identity for a file-spawned entity — the key for file-scope reconcile.
// A level-file spawn carrying an `id` gets `Persistent { uid: id }`; the scene remembers
// that uid's disposition per map (removed → don't re-spawn on revisit) so a killed boss,
// looted-and-removed entity, or recruited NPC doesn't come back, while id-less spawns keep
// respawning. Also the natural anchor for a future disk save / arbitrary entity references
// (pairs with EntitySnapshot).
/**
 * @typedef {Object} Persistent
 * @property {string} uid  authored, map-stable id from the level file
 */
globalThis.Persistent = "Persistent";
