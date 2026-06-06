// Fills Collision.hits with overlapping entity ids for game logic (sensors,
// pickups, area triggers). Detection only — no resolution. Owns col.hits: clears
// every collider's list each tick, then records overlaps where at least one side
// is non-solid (a sensor). Solid-vs-solid pairs are left to the resolution
// systems (SolidSystem / SeparationSystem).
globalThis.TriggerSystem = {
  update(world) {
    const ids = world.query(Collision, Position, BBox);

    for (let i = 0; i < ids.length; i++) world.get(Collision, ids[i]).hits.length = 0;

    for (let a = 0; a < ids.length; a++) {
      const ca = world.get(Collision, ids[a]);
      const pa = world.get(Position, ids[a]);
      const ba = world.get(BBox, ids[a]);
      const ax1 = pa.x + ba.x, ay1 = pa.y + ba.y;
      const ax2 = ax1 + ba.width, ay2 = ay1 + ba.height;

      for (let b = a + 1; b < ids.length; b++) {
        const cb = world.get(Collision, ids[b]);
        if (ca.solid && cb.solid) continue;

        const pb = world.get(Position, ids[b]);
        const bb = world.get(BBox, ids[b]);
        const bx1 = pb.x + bb.x, by1 = pb.y + bb.y;
        const bx2 = bx1 + bb.width, by2 = by1 + bb.height;

        if (ax2 > bx1 && bx2 > ax1 && ay2 > by1 && by2 > ay1) {
          ca.hits.push(ids[b]);
          cb.hits.push(ids[a]);
        }
      }
    }
  },
};
