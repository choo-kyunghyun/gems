// Fills Collision.hits with overlapping entity ids for game logic (sensors,
// pickups, area triggers). Detection only — no resolution. Owns col.hits: clears
// every collider's list each tick, then records overlaps where at least one side
// is non-solid (a sensor). Solid-vs-solid pairs are left to the resolution
// systems (SolidSystem / SeparationSystem).
//
// If world.broadphase is set, uses it for O(n) pair queries; otherwise falls
// back to O(n^2). Set world.broadphase = new Broadphase(w, h, cellSize) in
// the scene with cellSize > max entity diameter.
globalThis.TriggerSystem = {
  /** Rebuild every collider's `hits` list from this tick's sensor overlaps. @param {World} world */
  update(world) {
    const ids = world.query(Collision, Position, BBox);

    for (let i = 0; i < ids.length; i++)
      world.get(Collision, ids[i]).hits.length = 0;

    const bp = world.broadphase;
    if (bp !== undefined) {
      bp.clear();
      for (let i = 0; i < ids.length; i++) {
        const aabb = AABB.of(world, ids[i]);
        bp.insert(ids[i], aabb.cx, aabb.cy);
      }
      const w = world;
      bp.pairs((ida, idb) => {
        const ca = w.get(Collision, ida);
        const cb = w.get(Collision, idb);
        if (ca.solid && cb.solid) return;
        if (AABB.overlap(AABB.of(w, ida), AABB.of(w, idb))) {
          ca.hits.push(idb);
          cb.hits.push(ida);
        }
      });
    } else {
      for (let a = 0; a < ids.length; a++) {
        const ca = world.get(Collision, ids[a]);
        const ea = AABB.of(world, ids[a]);
        for (let b = a + 1; b < ids.length; b++) {
          const cb = world.get(Collision, ids[b]);
          if (ca.solid && cb.solid) continue;
          const eb = AABB.of(world, ids[b]);
          if (AABB.overlap(ea, eb)) {
            ca.hits.push(ids[b]);
            cb.hits.push(ids[a]);
          }
        }
      }
    }
  },
};
