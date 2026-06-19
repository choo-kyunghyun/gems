// Core ECS serialization primitive: capture an entity's components to a plain record and
// re-spawn it. Genre-agnostic — migrates an entity between Worlds (the player +
// traveling followers carried through RpgMap.go) and seeds disk saves + chunk streaming
// (a chunk un/load is the same capture/restore over a region's entities).
//
// Data objects are REFERENCED, not deep-copied: an in-memory migration destroys the old world
// right after capture, so the same component objects re-attach to the new one. For disk
// persistence, serialize the record yourself — mind the JSON nested-value fault + Set fields
// (see SaveData).
/** @typedef {Object} EntitySnapshotRecord @property {Object<string,Object>} components token -> data */
globalThis.EntitySnapshot = {
  /**
   * Snapshot an entity's components. With `components` (token array) capture only those;
   * otherwise every component the entity has.
   * @param {World} world @param {number} id @param {string[]} [components]
   * @returns {EntitySnapshotRecord}
   */
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

  /**
   * Add a snapshot's components onto an EXISTING entity (e.g. the player, which the controller
   * already created — so it can't go through restore's world.create).
   * @param {World} world @param {number} id @param {EntitySnapshotRecord} snapshot
   * @returns {number} the same id
   */
  apply(world, id, snapshot) {
    const comps = snapshot.components;
    // for...in over a plain object is GMRT-safe (Map/Set iteration is not).
    for (const token in comps) world.add(id, token, comps[token]);
    return id;
  },

  /**
   * Re-spawn an entity from a snapshot into `world`. `overrides` ({ token: data }) is applied
   * AFTER the captured components — e.g. a fresh Position at a map entry or a zeroed Velocity,
   * so a migrated entity doesn't keep its old-map coords.
   * @param {World} world @param {EntitySnapshotRecord} snapshot @param {Object<string,Object>} [overrides]
   * @returns {number} the new entity id
   */
  restore(world, snapshot, overrides) {
    const id = this.apply(world, world.create(), snapshot);
    if (overrides !== undefined)
      for (const token in overrides) world.add(id, token, overrides[token]);
    return id;
  },
};
