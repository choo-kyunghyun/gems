/**
 * Moves the dynamic solid bodies and keeps them out of the kinematic solids: each tick the
 * level's Colliders (`colliders` — a derived entry of the level's own entity, seeded on the first read and
 * refreshed here, THE collider walk of a tick) list the bodies, and every solid body with a
 * Velocity moves through its mirror (PuppetSystem) — `move_and_collide` against `Solid`, the
 * kinematic mirrors, one axis at a time in sub-steps of at most `maxStep`, the other axis's
 * move capped to 0 so the runtime's perpendicular try never creeps a body along a face it is
 * pressed into — and reads its Position back off the instance. A body slides along a face by
 * its own tangential velocity (x blocked, y free), and its Velocity is rewritten as the
 * displacement it actually made, so a reader of speed (Doll.pace) sees a body pressed into a
 * wall stand still. The runtime never pushes a body OUT of a solid it already overlaps (a
 * separation push can land one there), so a body found inside one takes the bake's push-out
 * (_resolve) before it moves. Bodies it moves must NOT also be in MovementSystem. The bake's
 * premise and the bare static collider are Colliders'.
 */
globalThis.SolidSystem = {
  KEY: "solid", // its derived token on the level's own entity — the Colliders
  maxStep: 8, // the runtime's sub-step (px): keep below the thinnest collider to prevent tunneling
  // the static grid's cell (px): insert AND query by AABB SPAN (every cell an AABB overlaps), so
  // there's no cell-size constraint (unlike the center-bucket Broadphase) and huge statics just
  // occupy many cells — a pure perf knob
  cell: 64,

  // Scratch reused every tick: the mover's rect for the push-out (docs/ARCHITECTURE.md → Hot-path idioms).
  _rect: AABB.rect(),

  /**
   * The level's Colliders, baked: a level this system has not updated yet (a map's first tick, a
   * reader before the first update) is refreshed here, so a reader (SeparationSystem,
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
    const entities = level.entities;
    const c = entities.derive(level.self, SolidSystem.KEY, SolidSystem._seed);

    c.refresh(entities);
    const statics = c.statics;

    // integrate the bodies the refresh listed (non-kinematic already) — the moving solid ones,
    // each through its mirror (hoisted column — one index read per body)
    const held = entities.column(Instance);
    const mask = Handle.INDEX_MASK;
    const ids = c.bodyIds;
    const cols = c.bodyCols;
    const poss = c.bodyPos;
    const boxes = c.bodyBoxes;
    const vels = c.bodyVels;
    const n = c.bodyCount;
    const maxStep = SolidSystem.maxStep;
    for (let i = 0; i < n; i++) {
      const vel = vels[i];
      if (vel === undefined) continue;
      if (!cols[i].solid) continue;
      const h = held[ids[i] & mask];
      if (h === undefined) continue; // no mirror yet — PuppetSystem's next update mints it
      if (!h.shaped) continue;
      const pos = poss[i];
      const box = boxes[i];
      const inst = h.inst;

      const dx = vel.x * dt;
      const dy = vel.y * dt;
      if (inst.place_meeting(inst.x, inst.y, Solid)) {
        // inside a solid already (a separation push): the bake's push-out, then the mirror follows
        SolidSystem._resolve(c, pos, box, statics, dx, true);
        SolidSystem._resolve(c, pos, box, statics, dy, false);
        inst.x = pos.x + h.ox;
        inst.y = pos.y + h.oy;
      }
      const m = Math.max(Math.abs(dx), Math.abs(dy));
      if (m === 0) continue;
      const iters = Math.max(1, Math.ceil(m / maxStep));
      const x0 = pos.x;
      const y0 = pos.y;
      // the return is a GML array: read through array_length or not at all (docs/GMRT.md)
      if (dx !== 0) inst.move_and_collide(dx, 0, Solid, iters, 0, 0, -1, 0);
      if (dy !== 0) inst.move_and_collide(0, dy, Solid, iters, 0, 0, 0, -1);
      pos.x = inst.x - h.ox;
      pos.y = inst.y - h.oy;
      vel.x = (pos.x - x0) / dt;
      vel.y = (pos.y - y0) / dt;
    }
  },

  /**
   * push body out of overlapping statics along one axis (deepest correction wins).
   * `statics` is the cached bake (precomputed edges), so the loop is
   * flat field reads — keep it free of entities.get / AABB.of (the profiled hot spot). Scans only the
   * statics in the grid cells the body's AABB overlaps. A multi-cell static
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

          // AABB.overlap inlined: the call is ~2x the test per candidate (perf.measured aabb.overlap)
          if (a.x2 <= b.x1 || b.x2 <= a.x1 || a.y2 <= b.y1 || b.y2 <= a.y1) continue;

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
