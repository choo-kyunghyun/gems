// discrete move-and-collide for dynamic solid bodies vs kinematic solids.
// integrates velocity itself (sub-stepped to prevent tunneling); resolves per axis (wall-slide is free).
// bodies it moves must NOT also be in MovementSystem.
globalThis.SolidSystem = {
  maxStep: 8, // keep below thinnest collider to prevent tunneling
  oneWayTol: 2, // px a body may sink into a one-way top and still be caught (resting slack)

  /** @param {ECS} world */
  update(world) {
    const dt = World.sim.tickDuration;

    // Per-tick snapshot of the kinematic solids: edges + oneWay baked into flat records, so the
    // body×static resolve loop below reads plain fields — no AABB.of / world.get per test. Those
    // per-test Map lookups + edge allocs were ~70% of the RPG's tick cost (profiled 2026-07-02:
    // ~20 bodies × ~90 statics × 2 axes ≈ 8ms/tick). Statics can't move mid-update, so a
    // once-per-tick capture is exact.
    const statics = [];
    for (const id of world.query(Collision, Position, BBox)) {
      const col = world.get(Collision, id);
      if (!col.solid || !col.kinematic) continue;
      const e = AABB.of(world, id);
      statics.push({
        x1: e.x1,
        y1: e.y1,
        x2: e.x2,
        y2: e.y2,
        oneWay: col.oneWay === true,
      });
    }

    for (const id of world.query(Collision, Position, BBox, Velocity)) {
      const col = world.get(Collision, id);
      if (!col.solid || col.kinematic) continue;

      const pos = world.get(Position, id);
      const vel = world.get(Velocity, id);
      const box = world.get(BBox, id);

      const dx = vel.x * dt;
      const dy = vel.y * dt;
      const steps = Math.max(
        1,
        Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / this.maxStep),
      );
      const sx = dx / steps;
      const sy = dy / steps;

      let grounded = false;

      for (let s = 0; s < steps; s++) {
        pos.x += sx;
        if (this._resolve(pos, box, col, statics, sx, true) !== 0) vel.x = 0;

        pos.y += sy;
        const pushY = this._resolve(pos, box, col, statics, sy, false);
        if (pushY !== 0) {
          if (pushY > 0) grounded = true; // pushed up = standing on floor
          vel.y = 0;
        }
      }

      if (col.passThroughTicks !== undefined && col.passThroughTicks > 0) {
        col.passThroughTicks--;
      }

      const gr = world.get(Grounded, id);
      if (gr !== undefined) gr.isGrounded = grounded;
    }
  },

  // push body out of overlapping statics along one axis (deepest correction wins).
  // `statics` is update()'s per-tick snapshot (precomputed edges + oneWay flag), so the loop is
  // flat field reads — keep it free of world.get / AABB.of (the profiled hot spot).
  // returns sign of correction (+1 = pushed toward -, i.e. up/left; -1 = toward +; 0 = none).
  // for Y, +1 means grounded.
  _resolve(pos, box, colMover, statics, v, isX) {
    const a = AABB.edges(pos, box);

    let correction = 0;

    for (let i = 0; i < statics.length; i++) {
      const b = statics[i];

      if (b.oneWay) {
        // jump-through platform: only blocks downward landing.
        // never push horizontally — sideways ejection was caused by that.
        // oneWayTol lets a resting body avoid slipping through on a sub-pixel sink.
        if (isX) continue;
        if (colMover.passThroughTicks > 0) continue;
        if (v < 0) continue;
        const prevBot = a.y2 - v; // bottom edge before this sub-step's move
        if (prevBot > b.y1 + this.oneWayTol) continue;
      }

      if (!AABB.overlap(a, b)) continue;

      const lo = isX ? a.x2 - b.x1 : a.y2 - b.y1; // overlap if pushed toward -
      const hi = isX ? b.x2 - a.x1 : b.y2 - a.y1; // overlap if pushed toward +
      let c;
      if (v > 0) c = -lo;
      else if (v < 0) c = hi;
      else c = lo < hi ? -lo : hi;

      if (Math.abs(c) > Math.abs(correction)) correction = c;
    }

    if (correction === 0) return 0;
    if (isX) pos.x += correction;
    else pos.y += correction;
    return correction < 0 ? 1 : -1;
  },
};
