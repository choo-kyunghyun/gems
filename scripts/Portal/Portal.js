// Destination carried on the portal entity so a live entities.query(Portal) can resolve it —
// required when portals are chunk-streamed and the level can't hold a fixed portals[] list.
/**
 * @typedef {Object} Portal
 * @property {string} toMap   destination map id (RpgGrid.MAPS key)
 * @property {string} toEntry destination entry point (meta.entries key)
 */
globalThis.Portal = "Portal";
