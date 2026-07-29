// Capture/restore an entity's components as a plain record — the single-entity counterpart to the
// store's export(). The substrate for whole-entity migration + chunk streaming. Contract below.
/** @typedef {Object} EntitySnapshotRecord @property {Object<string,Object>} components token -> data */
/**
 * The substrate for whole-entity migration between level stores (LevelManager.take/put/transfer wraps
 * it — the squad crossing a portal) and for chunk streaming (un/load is the same capture/restore over
 * a region). Data objects are REFERENCED, not deep-copied: a captured component re-attaches by
 * reference and the objects outlive the source store's destroy() (only the storage map is dropped).
 * For disk, serialize the record yourself (mind the JSON nested-value fault + Set fields).
 */
globalThis.EntitySnapshot = {
  /**
   * Snapshot an entity's components (subset if `components` given, else all).
   * @param {Entity} entities
   * @param {number} id
   * @param {string[]} [components]
   * @returns {EntitySnapshotRecord}
   */
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

  /**
   * Apply a snapshot onto an EXISTING entity (player controller already created it, can't go through restore).
   * @param {Entity} entities
   * @param {number} id
   * @param {EntitySnapshotRecord} snapshot
   * @returns {number} same id
   */
  apply(entities, id, snapshot) {
    const comps = snapshot.components;
    // for...in over a plain object is GMRT-safe; Map/Set iteration is not.
    for (const token in comps) entities.add(id, token, comps[token]);
    return id;
  },

  /**
   * entities.create + apply. `overrides` applied after (e.g. fresh Position so migrated entity drops old-map coords).
   * @param {Entity} entities
   * @param {EntitySnapshotRecord} snapshot
   * @param {Object<string,Object>} [overrides]
   * @returns {number} new entity id
   */
  restore(entities, snapshot, overrides) {
    const id = this.apply(entities, entities.create(), snapshot);
    if (overrides !== undefined)
      for (const token in overrides) entities.add(id, token, overrides[token]);
    return id;
  },
};
