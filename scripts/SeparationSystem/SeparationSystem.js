// equal-mass MTV push-apart for unit crowding. pure resolution — run after SolidSystem.
// O(n) via world.broadphase (cellSize > max entity diameter), else O(n²).
globalThis.SeparationSystem = {
  iterations: 1, // raise for dense clusters; broadphase re-buckets each pass

  /** @param {ECS} world */
  update(world) {
    // collect once; positions shift per pass but the body list is stable
    const bodies = [];
    for (const id of world.query(Collision, Position, BBox)) {
      const col = world.get(Collision, id);
      if (col.solid && !col.kinematic) bodies.push(id);
    }

    const bp = world.broadphase;
    const sep = (a, b) => SeparationSystem._separate(world, a, b);
    for (let it = 0; it < this.iterations; it++) {
      if (bp !== undefined) {
        bp.rebuild(world, bodies);
        bp.pairs(sep);
      } else {
        for (let a = 0; a < bodies.length; a++) {
          for (let b = a + 1; b < bodies.length; b++) {
            SeparationSystem._separate(world, bodies[a], bodies[b]);
          }
        }
      }
    }
  },

  // MTV split along shallower axis, half-step each body (equal mass).
  _separate(world, ida, idb) {
    const a = AABB.of(world, ida);
    const b = AABB.of(world, idb);

    if (!AABB.overlap(a, b)) return;

    const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
    const oy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);

    const pa = world.get(Position, ida);
    const pb = world.get(Position, idb);

    if (ox < oy) {
      const dir = a.cx < b.cx ? -1 : 1;
      pa.x += dir * ox * 0.5;
      pb.x -= dir * ox * 0.5;
    } else {
      const dir = a.cy < b.cy ? -1 : 1;
      pa.y += dir * oy * 0.5;
      pb.y -= dir * oy * 0.5;
    }
  },
};
