// Pushes overlapping dynamic solid bodies apart with an equal-mass MTV split,
// for unit crowding (RTS, bumping enemies). Runs SeparationSystem.iterations
// passes so dense clusters settle (pushing A off B may shove it into C). Pure
// resolution — it does not integrate motion, so run it after SolidSystem.
//
// If world.broadphase is set, uses it for O(n) pair queries; otherwise falls
// back to O(n^2). Set world.broadphase = new Broadphase(w, h, cellSize) in
// the scene with cellSize > max entity diameter.
globalThis.SeparationSystem = {
  iterations: 1,

  update(world) {
    const bp = world.broadphase;
    if (bp !== undefined) {
      this._updateBP(world, bp);
    } else {
      this._updateN2(world);
    }
  },

  _updateBP(world, bp) {
    const me = this;
    for (let it = 0; it < this.iterations; it++) {
      bp.clear();
      for (const id of world.query(Collision, Position, BBox)) {
        const col = world.get(Collision, id);
        if (!col.solid || col.kinematic) continue;
        const aabb = AABB.of(world, id);
        bp.insert(id, aabb.cx, aabb.cy);
      }
      bp.pairs((a, b) => me._separate(world, a, b));
    }
  },

  _updateN2(world) {
    const bodies = [];
    for (const id of world.query(Collision, Position, BBox)) {
      const col = world.get(Collision, id);
      if (col.solid && !col.kinematic) bodies.push(id);
    }
    for (let it = 0; it < this.iterations; it++) {
      for (let a = 0; a < bodies.length; a++) {
        for (let b = a + 1; b < bodies.length; b++) {
          this._separate(world, bodies[a], bodies[b]);
        }
      }
    }
  },

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
