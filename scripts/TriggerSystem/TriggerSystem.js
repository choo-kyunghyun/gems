// detection only — fills Collision.hits for sensors/pickups/triggers. no resolution.
// solid-vs-solid pairs skipped (handled by SolidSystem/SeparationSystem).
// O(n) via entities.broadphase (cellSize > max entity diameter), else O(n²).
globalThis.TriggerSystem = {
  /** @param {Entity} entities */
  update(entities) {
    const ids = entities.query(Collision, Position, BBox);

    for (let i = 0; i < ids.length; i++)
      entities.get(Collision, ids[i]).hits.length = 0;

    const bp = entities.broadphase;
    if (bp !== undefined) {
      bp.rebuild(entities, ids);
      const w = entities;
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
        const ca = entities.get(Collision, ids[a]);
        const ea = AABB.of(entities, ids[a]);
        for (let b = a + 1; b < ids.length; b++) {
          const cb = entities.get(Collision, ids[b]);
          if (ca.solid && cb.solid) continue;
          const eb = AABB.of(entities, ids[b]);
          if (AABB.overlap(ea, eb)) {
            ca.hits.push(ids[b]);
            cb.hits.push(ids[a]);
          }
        }
      }
    }
  },
};
