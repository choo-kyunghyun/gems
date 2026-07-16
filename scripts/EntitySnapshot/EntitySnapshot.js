// Capture/restore an entity's components as a plain record. Used for world-to-world migration
// (party across portals) and chunk streaming (un/load is the same capture/restore over a region).
// Data objects are REFERENCED, not deep-copied — safe for in-memory migration; for disk, serialize
// yourself (mind the JSON nested-value fault + Set fields).
/** @typedef {Object} EntitySnapshotRecord @property {Object<string,Object>} components token -> data */
globalThis.EntitySnapshot = {
  /** Snapshot an entity's components (subset if `components` given, else all). @param {Entity} world @param {number} id @param {string[]} [components] @returns {EntitySnapshotRecord} */
  capture(world, id, components) {
    let comps;
    if (components === undefined) {
      comps = world.componentsOf(id);
    } else {
      comps = {};
      for (let i = 0; i < components.length; i++) {
        const data = world.get(components[i], id);
        if (data !== undefined) comps[components[i]] = data;
      }
    }
    return { components: comps };
  },

  /** Apply a snapshot onto an EXISTING entity (player controller already created it, can't go through restore). @param {Entity} world @param {number} id @param {EntitySnapshotRecord} snapshot @returns {number} same id */
  apply(world, id, snapshot) {
    const comps = snapshot.components;
    // for...in over a plain object is GMRT-safe; Map/Set iteration is not.
    for (const token in comps) world.add(id, token, comps[token]);
    return id;
  },

  /** world.create + apply. `overrides` applied after (e.g. fresh Position so migrated entity drops old-map coords). @param {Entity} world @param {EntitySnapshotRecord} snapshot @param {Object<string,Object>} [overrides] @returns {number} new entity id */
  restore(world, snapshot, overrides) {
    const id = this.apply(world, world.create(), snapshot);
    if (overrides !== undefined)
      for (const token in overrides) world.add(id, token, overrides[token]);
    return id;
  },
};
