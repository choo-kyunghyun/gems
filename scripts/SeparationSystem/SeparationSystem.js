// Pushes overlapping dynamic solid bodies apart with an equal-mass MTV split,
// for unit crowding (RTS, bumping enemies). Runs SeparationSystem.iterations
// passes so dense clusters settle (pushing A off B may shove it into C). Pure
// resolution — it does not integrate motion, so run it after SolidSystem.
//
// O(n^2) per iteration; for large unit counts swap the pair loop for a spatial
// broadphase (see Query) later.
globalThis.SeparationSystem = {
  iterations: 1,

  update(world) {
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
    const pa = world.get(Position, ida);
    const ba = world.get(BBox, ida);
    const pb = world.get(Position, idb);
    const bb = world.get(BBox, idb);

    const ax1 = pa.x + ba.x, ay1 = pa.y + ba.y;
    const ax2 = ax1 + ba.width, ay2 = ay1 + ba.height;
    const bx1 = pb.x + bb.x, by1 = pb.y + bb.y;
    const bx2 = bx1 + bb.width, by2 = by1 + bb.height;

    if (ax2 <= bx1 || bx2 <= ax1 || ay2 <= by1 || by2 <= ay1) return;

    const ox = Math.min(ax2, bx2) - Math.max(ax1, bx1);
    const oy = Math.min(ay2, by2) - Math.max(ay1, by1);

    if (ox < oy) {
      const dir = ax1 + ax2 < bx1 + bx2 ? -1 : 1;
      pa.x += dir * ox * 0.5;
      pb.x -= dir * ox * 0.5;
    } else {
      const dir = ay1 + ay2 < by1 + by2 ? -1 : 1;
      pa.y += dir * oy * 0.5;
      pb.y -= dir * oy * 0.5;
    }
  },
};
