/** @typedef {Object} RowRecord @property {Object<string,Object>} components token -> data */
/**
 * A row captured whole — the substrate for whole-entity migration between stores and for exact
 * stamps. A whole capture (no list) takes the persistent components; a minted one stays behind
 * for the destination to rebuild. Data objects are referenced, not deep-copied, and outlive the
 * source store's destroy(). Serializing a record for disk is the caller's (docs/GMRT.md).
 */
globalThis.Row = {
  capture(entities, id, components) {
    let comps;
    if (components === undefined) {
      comps = entities.persistentOf(id);
    } else {
      comps = {};
      for (let i = 0; i < components.length; i++) {
        const data = entities.get(id, components[i]);
        if (data !== undefined) comps[components[i]] = data;
      }
    }
    return { components: comps };
  },

  /** Onto an existing entity the caller already created. */
  apply(entities, id, snapshot) {
    const comps = snapshot.components;
    // for...in over a plain object; Map iteration is unsafe (docs/GMRT.md)
    for (const token in comps) entities.add(id, token, comps[token]);
    return id;
  },

  /** `overrides` apply after the snapshot, such as a migrated entity's fresh position. */
  restore(entities, snapshot, overrides) {
    const id = Row.apply(entities, entities.create(), snapshot);
    if (overrides !== undefined)
      for (const token in overrides) entities.add(id, token, overrides[token]);
    return id;
  },
};
