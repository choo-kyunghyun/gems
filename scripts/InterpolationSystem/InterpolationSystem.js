/**
 * lerp: PrevPosition + (Position - PrevPosition) * alpha, shared by all render passes. Only movers get
 * PrevPosition; static bodies fall back to raw Position.
 */
globalThis.InterpolationSystem = {
  snapshot(entities) {
    for (const id of entities.query(Position, Velocity)) {
      const pos = entities.get(id, Position);
      const prev = entities.get(id, PrevPosition);
      if (prev === undefined) {
        entities.add(id, PrevPosition, { x: pos.x, y: pos.y, z: pos.z });
      } else {
        prev.x = pos.x;
        prev.y = pos.y;
        prev.z = pos.z;
      }
    }
  },

  /** Writes into `out` (reused scratch — no alloc per entity). */
  lerp(entities, id, out) {
    const pos = entities.get(id, Position);
    const prev = entities.get(id, PrevPosition);
    out.x =
      prev !== undefined ? prev.x + (pos.x - prev.x) * SimClock.alpha : pos.x;
    out.y =
      prev !== undefined ? prev.y + (pos.y - prev.y) * SimClock.alpha : pos.y;
    return out;
  },
};
