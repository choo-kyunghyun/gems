// render-interpolation bookkeeping.
// snapshot: call at TOP of each tick before any system moves Position.
// lerp: shared formula for all render passes — PrevPosition + (Position-PrevPosition)*alpha.
// only movers get PrevPosition; static bodies fall back to raw Position.
globalThis.InterpolationSystem = {
  /** @param {Entity} world */
  snapshot(world) {
    for (const id of world.query(Position, Velocity)) {
      const pos = world.get(Position, id);
      const prev = world.get(PrevPosition, id);
      if (prev === undefined) {
        world.add(id, PrevPosition, { x: pos.x, y: pos.y, z: pos.z });
      } else {
        prev.x = pos.x;
        prev.y = pos.y;
        prev.z = pos.z;
      }
    }
  },

  /**
   * interpolated render position; writes into `out` (reused scratch, no alloc per entity).
   * @param {Entity} world @param {number} id @param {{x:number,y:number}} out
   * @returns {{x:number,y:number}} out
   */
  lerp(world, id, out) {
    const pos = world.get(Position, id);
    const prev = world.get(PrevPosition, id);
    out.x =
      prev !== undefined ? prev.x + (pos.x - prev.x) * World.sim.alpha : pos.x;
    out.y =
      prev !== undefined ? prev.y + (pos.y - prev.y) * World.sim.alpha : pos.y;
    return out;
  },
};
