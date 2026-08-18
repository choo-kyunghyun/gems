/** @typedef {Object} EntitySnapshotRecord @property {Object<string,Object>} components token -> data */
/**
 * The substrate for whole-entity migration between level stores (World.take/put/transfer wraps
 * it — the squad crossing a portal) and for re-creating a saved map's residents (SaveGame's
 * restoreResidents). Data objects are REFERENCED, not deep-copied: a captured component re-attaches by
 * reference and the objects outlive the source store's destroy() (only the storage map is dropped).
 * For disk, serialize the record yourself (mind the JSON nested-value fault + Set fields).
 */
globalThis.EntitySnapshot = {
  capture(entities, id, components) {
    let comps;
    if (components === undefined) {
      comps = entities.componentsOf(id);
    } else {
      comps = {};
      for (let i = 0; i < components.length; i++) {
        const data = entities.get(components[i], id);
        if (data !== undefined) comps[components[i]] = data;
      }
    }
    return { components: comps };
  },

  /** Onto an EXISTING entity (the caller already created it — can't go through restore). */
  apply(entities, id, snapshot) {
    const comps = snapshot.components;
    // for...in over a plain object is GMRT-safe; Map/Set iteration is not.
    for (const token in comps) entities.add(id, token, comps[token]);
    return id;
  },

  /** `overrides` applied after the snapshot (e.g. fresh Position so a migrated entity drops old-map coords). */
  restore(entities, snapshot, overrides) {
    const id = this.apply(entities, entities.create(), snapshot);
    if (overrides !== undefined)
      for (const token in overrides) entities.add(id, token, overrides[token]);
    return id;
  },
};
