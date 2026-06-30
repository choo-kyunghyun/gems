// Destination carried on the portal entity so a live Tag "portal" query can resolve it —
// required when portals are chunk-streamed and the scene can't hold a fixed portals[] list.
/**
 * @typedef {Object} Portal
 * @property {string} toMap   destination map id (RpgLevel.MAPS key)
 * @property {string} toEntry destination entry point (meta.entries key)
 */
globalThis.Portal = "Portal";
