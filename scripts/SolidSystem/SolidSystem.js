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
 * wall stand still. Every displacement a body takes goes through the runtime (SeparationSystem's
 * push too), so no body is ever inside a solid. Bodies it moves must NOT also be in
 * MovementSystem. The bake's premise and the bare static collider are Colliders'.
 */
globalThis.SolidSystem = {
  KEY: "solid", // its derived token on the level's own entity — the Colliders
  maxStep: 8, // the runtime's sub-step (px): keep below the thinnest collider to prevent tunneling

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
    return new Colliders();
  },

  update(level) {
    const dt = Time.step;
    const entities = level.entities;
    const c = entities.derive(level.self, SolidSystem.KEY, SolidSystem._seed);

    c.refresh(entities);

    // integrate the bodies the refresh listed (non-kinematic already) — the moving solid ones,
    // each through its mirror (hoisted column — one index read per body)
    const held = entities.column(Instance);
    const mask = Handle.INDEX_MASK;
    const ids = c.bodyIds;
    const cols = c.bodyCols;
    const poss = c.bodyPos;
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
      const inst = h.inst;

      const dx = vel.x * dt;
      const dy = vel.y * dt;
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
};
