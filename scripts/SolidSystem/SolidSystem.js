// Discrete "move-and-collide" for dynamic solid bodies against kinematic solids
// (GameMaker move_and_collide style). Integrates each body's Velocity itself,
// sub-stepped so fast movers can't tunnel, and resolves overlaps per axis so
// wall-slide falls out for free. A body pushed upward out of a downward move is
// flagged Grounded (this replaces the old GroundedSystem).
//
// Because it integrates motion, bodies it moves must NOT also be moved by
// MovementSystem. Tunable: SolidSystem.maxStep — max px per sub-step; keep it
// below the thinnest collider.
globalThis.SolidSystem = {
  maxStep: 8,
  oneWayTol: 2, // px a body may sink into a one-way top and still be caught (resting slack)

  update(world) {
    const dt = world.tickDuration;

    const statics = [];
    for (const id of world.query(Collision, Position, BBox)) {
      const col = world.get(Collision, id);
      if (col.solid && col.kinematic) statics.push(id);
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
        if (this._resolve(world, id, pos, box, col, statics, sx, true) !== 0)
          vel.x = 0;

        pos.y += sy;
        const pushY = this._resolve(
          world,
          id,
          pos,
          box,
          col,
          statics,
          sy,
          false,
        );
        if (pushY !== 0) {
          if (pushY > 0) grounded = true; // pushed up => standing on a floor
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

  // Pushes the body out of every overlapping static along one axis, applying the
  // deepest correction. Direction follows motion (move v): a body moving + is
  // pushed -. Returns the applied correction's sign (+1 = pushed toward -, i.e.
  // up/left; -1 = pushed toward +; 0 = no contact). For Y, +1 means grounded.
  _resolve(world, id, pos, box, colMover, statics, v, isX) {
    const ax1 = pos.x + box.x;
    const ay1 = pos.y + box.y;
    const ax2 = ax1 + box.width;
    const ay2 = ay1 + box.height;

    let correction = 0;

    for (const sid of statics) {
      const sPos = world.get(Position, sid);
      const sBox = world.get(BBox, sid);
      const bx1 = sPos.x + sBox.x;
      const by1 = sPos.y + sBox.y;
      const bx2 = bx1 + sBox.width;
      const by2 = by1 + sBox.height;

      const sCol = world.get(Collision, sid);
      if (sCol && sCol.oneWay) {
        // Jump-through platform: only ever stops a body landing on it from
        // above. It must never push horizontally (skip on the X axis) — pushing
        // a body that has sunk into it sideways is what ejected the player to
        // the ledge edge. It also lets a body through while moving up, while
        // already below its top, or while a drop is active. oneWayTol keeps a
        // body resting flush on top from slipping under on a sub-pixel sink.
        if (isX) continue;
        if (colMover.passThroughTicks > 0) continue;
        if (v < 0) continue;
        const prevBot = pos.y - v + box.y + box.height;
        if (prevBot > sPos.y + sBox.y + this.oneWayTol) continue;
      }

      if (ax2 <= bx1 || ax1 >= bx2 || ay2 <= by1 || ay1 >= by2) continue;

      const lo = isX ? ax2 - bx1 : ay2 - by1; // overlap if pushed toward -
      const hi = isX ? bx2 - ax1 : by2 - ay1; // overlap if pushed toward +
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
