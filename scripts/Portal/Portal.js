// Destination carried on the portal entity so a live entities.query(Portal) can resolve it —
// required because a portal can come from the level file, a generator, or a save restore, so no
// fixed portals[] list on the level would stay valid.
/**
 * @typedef {Object} Portal
 * @property {string} toMap   destination map id (ColonyLevel.MAPS key)
 * @property {string} toEntry destination entry point (meta.entries key)
 */
globalThis.Portal = "Portal";
