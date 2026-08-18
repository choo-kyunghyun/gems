// Detection only — fills Collision.hits for sensors/pickups/triggers (no resolution); solid-vs-solid
// pairs skipped (SolidSystem/SeparationSystem handle those). O(n) via entities.broadphase, else O(n²).
globalThis.TriggerSystem = {
  // Scratch reused every tick: the sweep clears hits, buckets, then tests thousands of pairs,
  // and an allocation per test dominated it (docs/PERF.md). Transient within one update().
  _ids: [],
  _a: AABB.rect(),
  _b: AABB.rect(),

  update(entities) {
    // Clear hits AND collect the sweep set in one pass. Kinematic solids (merged wall/terrain
    // rects) are excluded from the sweep entirely: they span many broadphase cells, breaking the
    // center-bucket contract (cell size > largest entity), so their pairs were missed
    // inconsistently and matched ones were noise no consumer reads.
    const ids = TriggerSystem._ids;
    let w = 0;
    entities.forEach([Collision, Position, BBox], (id, col) => {
      col.hits.length = 0;
      if (col.solid && col.kinematic) return;
      ids[w++] = id;
    });
    ids.length = w;

    const a = TriggerSystem._a;
    const b = TriggerSystem._b;
    const bp = entities.broadphase;
    if (bp !== undefined) {
      bp.rebuild(entities, ids);
      const w2 = entities;
      bp.pairs((ida, idb) => {
        const ca = w2.get(ida, Collision);
        const cb = w2.get(idb, Collision);
        if (ca.solid && cb.solid) return;
        if (
          AABB.overlap(AABB.ofInto(w2, ida, a), AABB.ofInto(w2, idb, b))
        ) {
          ca.hits.push(idb);
          cb.hits.push(ida);
        }
      });
    } else {
      for (let i = 0; i < ids.length; i++) {
        const ca = entities.get(ids[i], Collision);
        AABB.ofInto(entities, ids[i], a);
        for (let j = i + 1; j < ids.length; j++) {
          const cb = entities.get(ids[j], Collision);
          if (ca.solid && cb.solid) continue;
          if (AABB.overlap(a, AABB.ofInto(entities, ids[j], b))) {
            ca.hits.push(ids[j]);
            cb.hits.push(ids[i]);
          }
        }
      }
    }
  },
};
