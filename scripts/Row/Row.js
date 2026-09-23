/** @typedef {Object} RowRecord @property {Object<string,Object>} components token -> data */
/**
 * A row captured whole — the substrate for whole-entity migration between stores and for exact
 * stamps. A whole capture (no list) takes the persistent components; a minted one stays behind
 * for the destination to rebuild. A capture references the source's data; every apply lays down
 * its own copy of the plain data, so one record stamps any number of rows that share nothing with
 * it, its source or each other — an asset ref or other non-plain value is shared, never copied
 * (docs/GMRT.md). Serializing a record for disk is the caller's (docs/GMRT.md).
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
    for (const token in comps) entities.add(id, token, Row._copy(comps[token]));
    return id;
  },

  /** `overrides` apply after the snapshot, such as a migrated entity's fresh position. */
  restore(entities, snapshot, overrides) {
    const id = Row.apply(entities, entities.create(), snapshot);
    if (overrides !== undefined)
      for (const token in overrides) entities.add(id, token, overrides[token]);
    return id;
  },

  /** Arrays and plain objects deep; anything else by reference. */
  _copy(v) {
    if (Array.isArray(v)) {
      const out = [];
      for (let i = 0; i < v.length; i++) out.push(Row._copy(v[i]));
      return out;
    }
    if (v !== null && typeof v === "object" && v.constructor === Object) {
      const out = {};
      for (const key in v) out[key] = Row._copy(v[key]);
      return out;
    }
    return v;
  },
};
