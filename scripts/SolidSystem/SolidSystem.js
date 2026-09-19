/**
 * Moves the dynamic solid bodies and keeps them out of the kinematic solids: each tick the
 * level's Colliders (`colliders` — a derived entry of the level's own entity, seeded on the first read and
 * refreshed here, THE collider walk of a tick) list the bodies, and every solid body with a
 * Velocity integrates it in sub-steps of at most `maxStep`, pushed out of any static it enters
 * along one axis at a time (_resolve). Bodies it moves must NOT also be in MovementSystem. The
 * bake's premise, the segment queries over it and the bare static collider are Colliders'.
 */
globalThis.SolidSystem = {
  KEY: "solid", // its derived token on the level's own entity — the Colliders
  maxStep: 8, // keep below thinnest collider to prevent tunneling
  // the static grid's cell (px): insert AND query by AABB SPAN (every cell an AABB overlaps), so
  // there's no cell-size constraint (unlike the center-bucket Broadphase) and huge statics just
  // occupy many cells — a pure perf knob
  cell: 64,

  // Scratch reused every tick: the mover's rect (_resolve runs twice per sub-step per body —
  // docs/ARCHITECTURE.md → Hot-path idioms).
  _rect: AABB.rect(),

  /**
   * The level's Colliders, baked: a level this system has not updated yet (a map's first tick, a
   * reader before the first update) is refreshed here, so a reader (Raycast, SeparationSystem,
   * PathfindingSystem) never sees an empty bake.
   */
  colliders(level) {
    const c = level.entities.derive(level.self, SolidSystem.KEY, SolidSystem._seed);
    if (c.ids === null) c.refresh(level.entities);
    return c;
  },

  _seed() {
    return new Colliders(SolidSystem.cell);
  },

  update(level) {
    const dt = Time.step;
    const c = level.entities.derive(level.self, SolidSystem.KEY, SolidSystem._seed);

    c.refresh(level.entities);
    const statics = c.statics;

    // integrate the bodies the refresh listed (non-kinematic already) — the moving solid ones
    const cols = c.bodyCols;
    const poss = c.bodyPos;
    const boxes = c.bodyBoxes;
    const vels = c.bodyVels;
    const n = c.bodyCount;
    for (let i = 0; i < n; i++) {
      const vel = vels[i];
      if (vel === undefined) continue;
      if (!cols[i].solid) continue;
      const pos = poss[i];
      const box = boxes[i];

      const dx = vel.x * dt;
      const dy = vel.y * dt;
      const steps = Math.max(
        1,
        Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / SolidSystem.maxStep),
      );
      const sx = dx / steps;
      const sy = dy / steps;

      for (let s = 0; s < steps; s++) {
        pos.x += sx;
        if (SolidSystem._resolve(c, pos, box, statics, sx, true) !== 0)
          vel.x = 0;

        pos.y += sy;
        if (SolidSystem._resolve(c, pos, box, statics, sy, false) !== 0)
          vel.y = 0;
      }
    }
  },

  /**
   * push body out of overlapping statics along one axis (deepest correction wins).
   * `statics` is the cached bake (precomputed edges), so the loop is
   * flat field reads — keep it free of entities.get / AABB.of (the profiled hot spot). Scans only the
   * statics in the grid cells the body's post-move AABB overlaps (sub-stepping caps the move to
   * maxStep, so the current AABB captures every static this sub-step could hit). A multi-cell static
   * may be tested more than once — harmless: the overlap/deepest-correction body is idempotent.
   * returns sign of correction (+1 = pushed toward -, i.e. up/left; -1 = toward +; 0 = none).
   */
  _resolve(c, pos, box, statics, v, isX) {
    const a = AABB.edgesInto(pos, box, SolidSystem._rect);

    let correction = 0;

    // exact cell range an [x1,x2)×[y1,y2) AABB touches: floor(lo) .. ceil(hi)-1 (x2/y2 exclusive)
    const cell = c.cell;
    const gx0 = c.clampCol(Math.floor(a.x1 / cell));
    const gy0 = c.clampRow(Math.floor(a.y1 / cell));
    const gx1 = c.clampCol(Math.ceil(a.x2 / cell) - 1);
    const gy1 = c.clampRow(Math.ceil(a.y2 / cell) - 1);
    const buckets = c.buckets;
    const cols = c.cols;

    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const bucket = buckets[gy * cols + gx];
        for (let k = 0; k < bucket.length; k++) {
          const b = statics[bucket[k]];

          if (!AABB.overlap(a, b)) continue;

          const lo = isX ? a.x2 - b.x1 : a.y2 - b.y1; // overlap if pushed toward -
          const hi = isX ? b.x2 - a.x1 : b.y2 - a.y1; // overlap if pushed toward +
          let cc;
          if (v > 0) cc = -lo;
          else if (v < 0) cc = hi;
          else cc = lo < hi ? -lo : hi;

          if (Math.abs(cc) > Math.abs(correction)) correction = cc;
        }
      }
    }

    if (correction === 0) return 0;
    if (isX) pos.x += correction;
    else pos.y += correction;
    return correction < 0 ? 1 : -1;
  },
};
