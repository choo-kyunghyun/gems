// Render-interpolation bookkeeping for the fixed-timestep loop.
//
//   snapshot(world): call at the TOP of each physics tick, before any system moves
//     Position — records each mover's current Position into PrevPosition.
//   lerp(world, id, out): the read-back — the interpolated render position
//     PrevPosition + (Position - PrevPosition) * world.alpha,
//     so every render pass draws smooth fixed-step motion through ONE shared
//     formula instead of re-deriving it. Only entities with Velocity get a
//     PrevPosition (static bodies never move, so lerp falls back to raw Position).
globalThis.InterpolationSystem = {
  /** Record movers' Position into PrevPosition. Call at the top of each tick. @param {World} world */
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
   * Interpolated render position for `id`: PrevPosition→Position by world.alpha,
   * falling back to raw Position when the entity has no PrevPosition. Writes into
   * `out` (a reused {x,y} scratch) so render loops don't allocate per entity.
   * Assumes the caller's query guarantees `id` has a Position.
   * @param {World} world @param {number} id @param {{x:number,y:number}} out
   * @returns {{x:number,y:number}} out
   */
  lerp(world, id, out) {
    const pos = world.get(Position, id);
    const prev = world.get(PrevPosition, id);
    out.x = prev !== undefined ? prev.x + (pos.x - prev.x) * world.alpha : pos.x;
    out.y = prev !== undefined ? prev.y + (pos.y - prev.y) * world.alpha : pos.y;
    return out;
  },
};
