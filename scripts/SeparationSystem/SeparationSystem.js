// Pushes overlapping dynamic solid bodies apart with an equal-mass MTV split,
// for unit crowding (RTS, bumping enemies). Runs SeparationSystem.iterations
// passes so dense clusters settle (pushing A off B may shove it into C). Pure
// resolution — it does not integrate motion, so run it after SolidSystem.
//
// O(n) pair queries via world.broadphase when set (cellSize > max entity
// diameter), else O(n^2).
globalThis.SeparationSystem = {
  iterations: 1, // resolution passes per tick; raise so dense clusters settle

  /** Push overlapping dynamic solid bodies apart (broadphase path when `world.broadphase` is set). @param {World} world */
  update(world) {
    // Dynamic solid bodies — stable across iterations (only their positions move), so collect
    // once; the broadphase re-buckets each pass since centers shift.
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

  // Split the minimum-translation overlap along the shallower axis, moving each
  // body half the penetration apart (equal mass).
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
