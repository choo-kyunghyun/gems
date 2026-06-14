// Core ECS serialization primitive: capture an entity's components to a plain record and
// re-spawn it. The capture/restore pair is genre-agnostic — used to migrate an entity across
// a World rebuild (the player + traveling followers carried through a map change in
// sceneRpg.loadMap) and the seed for disk saves + chunk streaming (a chunk un/load is the
// same capture/restore over a region's entities).
//
// Data objects are REFERENCED, not deep-copied: an in-memory migration destroys the old world
// right after capture, so the same component objects are re-added to the new one (matching the
// player-sheet carry). For disk persistence, serialize the record yourself — it's plain
// component data, so mind the JSON nested-value fault + Set-typed fields (see SaveData).
globalThis.EntitySnapshot = {
  // Snapshot an entity. With `components` (an array of tokens) capture only those; otherwise
  // every component the entity has. Returns { components: { token: data } }.
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

  // Add a snapshot's components onto an EXISTING entity (e.g. the player, which the
  // controller creates — so it can't go through restore's world.create). Returns the id.
  // for...in over a plain object is GMRT-safe (Map/Set iteration is not).
  apply(world, id, snapshot) {
    const comps = snapshot.components;
    for (const token in comps) world.add(id, token, comps[token]);
    return id;
  },

  // Re-spawn an entity from a snapshot into `world`; returns the new id. `overrides` is an
  // optional { token: data } applied AFTER the captured components — e.g. a fresh Position at
  // a map entry or a zeroed Velocity, so a migrated entity doesn't keep its old-map coords.
  restore(world, snapshot, overrides) {
    const id = this.apply(world, world.create(), snapshot);
    if (overrides !== undefined)
      for (const token in overrides) world.add(id, token, overrides[token]);
    return id;
  },
};
