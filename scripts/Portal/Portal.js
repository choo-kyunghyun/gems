// A doorway's destination, carried on the portal entity itself so a live tag query
// (Tag "portal") can resolve where it leads — needed when portals are streamed in by the
// chunk manager and the scene can no longer hold a fixed portals[] list from initial spawn.
// The non-chunked path still uses RpgSpawn.spawn's parallel portals[] return; this component
// is the same data attached to the entity.
globalThis.Portal = "Portal";
/**
 * @typedef {Object} Portal
 * @property {string} toMap   destination map id (RpgLevel.MAPS key)
 * @property {string} toEntry destination entry point (meta.entries key)
 */
