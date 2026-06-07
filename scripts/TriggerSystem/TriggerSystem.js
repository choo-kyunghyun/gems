// Fills Collision.hits with overlapping entity ids for game logic (sensors,
// pickups, area triggers). Detection only — no resolution. Owns col.hits: clears
// every collider's list each tick, then records overlaps where at least one side
// is non-solid (a sensor). Solid-vs-solid pairs are left to the resolution
// systems (SolidSystem / SeparationSystem).
globalThis.TriggerSystem = {
  update(world) {
    const ids = world.query(Collision, Position, BBox);

    for (let i = 0; i < ids.length; i++)
      world.get(Collision, ids[i]).hits.length = 0;

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
  },
};
