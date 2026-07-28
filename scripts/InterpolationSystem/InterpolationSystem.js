// Render-interpolation bookkeeping — snapshot() at the TOP of each tick (before any system moves
// Position); lerp() is the shared render formula. Contract on the declaration below.
/**
 * lerp: PrevPosition + (Position - PrevPosition) * alpha, shared by all render passes. Only movers get
 * PrevPosition; static bodies fall back to raw Position.
 */
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
   * @param {Entity} entities
   * @param {number} id
   * @param {{x:number,y:number}} out
   * @returns {{x:number,y:number}} out
   */
  lerp(entities, id, out) {
    const pos = entities.get(Position, id);
    const prev = entities.get(PrevPosition, id);
    out.x =
      prev !== undefined ? prev.x + (pos.x - prev.x) * SimClock.alpha : pos.x;
    out.y =
      prev !== undefined ? prev.y + (pos.y - prev.y) * SimClock.alpha : pos.y;
    return out;
  },
};
