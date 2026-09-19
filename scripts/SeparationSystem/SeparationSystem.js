// equal-mass MTV push-apart for unit crowding. Pure resolution, run after SolidSystem.update in
// the SAME tick: the bodies come from the level's Colliders (that update's collider walk, so no
// second walk here), and a scene that drops this system costs SolidSystem nothing.
// O(n) via the level's Broadphase — a derived entry of the level's own entity, seeded over the
// grid's extent on the first update (a grid-less level has no extent to bucket and sweeps O(n²)).
globalThis.SeparationSystem = {
  KEY: "separation", // its derived token on the level's own entity — the Broadphase
  iterations: 1, // raise for dense clusters; broadphase re-buckets each pass
  // the broadphase cell (px): the center-bucket contract wants it above the largest dynamic
  // body's diameter (~27px at 16px cells); huge SOLID colliders (the border, water) never enter
  // it — only dynamic bodies are bucketed. SolidSystem's asymmetric body-vs-static query keeps
  // its OWN span-bucketed grid, a different query shape.
  cellSize: 96,

  // Scratch reused every tick — the body list and the two pair rects (docs/ARCHITECTURE.md → Hot-path idioms).
  _bodies: [],
  _a: AABB.rect(),
  _b: AABB.rect(),

  update(level) {
    const entities = level.entities;
    // collect once; positions shift per pass but the body list is stable. eachBody lists the
    // non-kinematic colliders, `col` live — a corpse (solid flipped off) drops out this tick.
    const bodies = SeparationSystem._bodies;
    let w = 0;
    SolidSystem.colliders(level).eachBody((id, col) => {
      if (col.solid) bodies[w++] = id;
    });
    bodies.length = w;

    const grid = level.grid;
    const bp =
      grid !== null
        ? level.entities.derive(
            level.self,
            SeparationSystem.KEY,
            () =>
              new Broadphase(
                grid.cols * grid.cellWidth,
                grid.rows * grid.cellHeight,
                SeparationSystem.cellSize,
              ),
          )
        : undefined;
    const sep = (a, b) => SeparationSystem._separate(entities, a, b);
    for (let it = 0; it < SeparationSystem.iterations; it++) {
      if (bp !== undefined) {
        bp.rebuild(entities, bodies);
        bp.pairs(sep);
      } else {
        for (let a = 0; a < bodies.length; a++) {
          for (let b = a + 1; b < bodies.length; b++) {
            SeparationSystem._separate(entities, bodies[a], bodies[b]);
          }
        }
      }
    }
  },

  _separate(entities, ida, idb) {
    const a = AABB.ofInto(entities, ida, SeparationSystem._a);
    const b = AABB.ofInto(entities, idb, SeparationSystem._b);

    if (!AABB.overlap(a, b)) return;

    const ox = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
    const oy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);

    const pa = entities.get(ida, Position);
    const pb = entities.get(idb, Position);

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
