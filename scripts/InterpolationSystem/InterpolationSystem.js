// render-interpolation bookkeeping.
// snapshot: call at TOP of each tick before any system moves Position.
// lerp: shared formula for all render passes — PrevPosition + (Position-PrevPosition)*alpha.
// only movers get PrevPosition; static bodies fall back to raw Position.
globalThis.InterpolationSystem = {
  /** @param {Entity} entities */
  snapshot(entities) {
    for (const id of entities.query(Position, Velocity)) {
      const pos = entities.get(Position, id);
      const prev = entities.get(PrevPosition, id);
      if (prev === undefined) {
        entities.add(id, PrevPosition, { x: pos.x, y: pos.y, z: pos.z });
      } else {
        prev.x = pos.x;
        prev.y = pos.y;
        prev.z = pos.z;
      }
    }
  },

  /**
   * interpolated render position; writes into `out` (reused scratch, no alloc per entity).
   * @param {Entity} entities @param {number} id @param {{x:number,y:number}} out
   * @returns {{x:number,y:number}} out
   */
  lerp(entities, id, out) {
    const pos = entities.get(Position, id);
    const prev = entities.get(PrevPosition, id);
    out.x =
      prev !== undefined ? prev.x + (pos.x - prev.x) * World.sim.alpha : pos.x;
    out.y =
      prev !== undefined ? prev.y + (pos.y - prev.y) * World.sim.alpha : pos.y;
    return out;
  },
};
