// Render-interpolation bookkeeping for the fixed-timestep loop.
//
// Call snapshot(world) at the TOP of each physics tick, before any system moves
// Position. It records each mover's current Position into PrevPosition, so after
// the tick loop a renderer can draw at:
//
//   render = PrevPosition + (Position - PrevPosition) * world.alpha
//
// which interpolates the last tick of motion across the real frames between
// ticks. Only entities with Velocity are tracked (static bodies never move, so
// renderers fall back to Position for them — see PrevPosition).
globalThis.InterpolationSystem = {
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
};
