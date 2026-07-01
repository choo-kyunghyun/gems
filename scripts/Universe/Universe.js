// The singleton LEVEL MANAGER — the registry of resident levels + the whole-entity transfer
// primitive between them. A static namespace like WorldClock/RpgMap (one universe).
//
//   #1 "levels own their entities": a level's entities ARE its `World` (the ECS store) and its data
//      its `Level` (tiles/nav/zones). Universe just INDEXES those per map id — it doesn't copy them.
//   #2 "transfer entities between levels": take()/put()/transfer() move a WHOLE entity (every
//      component, via EntitySnapshot) out of one level's World and into another's — not a partial
//      snapshot. When the destination isn't resident, transfer() returns the snapshot so the caller
//      holds it until that level loads (the record-mediated path the wandering Trader rides).
//
// The map pool (RpgMap) owns level lifecycle (build/park/resume/evict); Universe mirrors it as a flat
// mapId -> {world, level} index so any system can reach a level's store by id and move entities across
// the graph without knowing whether the destination is the active map, parked, or absent. RpgMap
// registers on build/resume, unregisters on evict; a parked map stays resident (its World isn't
// destroyed), so its index entry stays valid across the park.
globalThis.Universe = {
  _levels: {}, // mapId -> { world, level } for every RESIDENT level (active + parked pool)
  _active: null, // the mapId currently stepped + drawn

  // index a level's store under its map id (idempotent — re-registering a resumed map overwrites
  // with the same live objects). Called by RpgMap on build/resume.
  register(mapId, world, level) {
    Universe._levels[mapId] = { world: world, level: level };
  },
  // drop a level from the index (its World is about to be destroyed — evict / scene end).
  unregister(mapId) {
    delete Universe._levels[mapId];
  },
  setActive(mapId) {
    Universe._active = mapId;
  },
  activeId() {
    return Universe._active;
  },
  isResident(mapId) {
    return Universe._levels[mapId] !== undefined;
  },
  worldOf(mapId) {
    const l = Universe._levels[mapId];
    return l !== undefined ? l.world : null;
  },
  levelOf(mapId) {
    const l = Universe._levels[mapId];
    return l !== undefined ? l.level : null;
  },

  // Capture a WHOLE entity (all components) out of a resident level's World and remove it. Returns
  // the snapshot (the caller now owns it), or null if the level isn't resident. EntitySnapshot
  // references the component data objects, so they survive the remove/flush (see EntitySnapshot).
  take(mapId, id) {
    const w = Universe.worldOf(mapId);
    if (w === null) return null;
    const snap = EntitySnapshot.capture(w, id); // no component list → every component
    w.remove(id);
    return snap;
  },
  // Restore a whole-entity snapshot into a resident level's World; `overrides` apply after (e.g. a
  // fresh Position for the destination). Returns the new id, or -1 if the level isn't resident.
  put(mapId, snap, overrides) {
    const w = Universe.worldOf(mapId);
    if (w === null) return -1;
    return EntitySnapshot.restore(w, snap, overrides);
  },
  // Move a whole entity from one level to another. Destination resident → it lands there (new id);
  // not resident → the snapshot is returned for the caller to hold until it loads.
  transfer(fromMapId, toMapId, id, overrides) {
    const snap = Universe.take(fromMapId, id);
    if (snap === null) return null;
    if (Universe.isResident(toMapId))
      return Universe.put(toMapId, snap, overrides);
    return snap;
  },

  // New game / scene teardown — the pooled Worlds are freed by RpgMap, so just drop the index.
  reset() {
    Universe._levels = {};
    Universe._active = null;
  },
};
