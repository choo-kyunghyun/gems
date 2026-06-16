/**
 * Integrates `Velocity` into `Position` each tick for FREE movers (no collision
 * response). Solid bodies are integrated by `SolidSystem` and projectiles by
 * `ProjectileSystem` — a given mover is moved by exactly one of the three.
 */
globalThis.MovementSystem = {
  /** @param {World} world */
  update(world) {
    const dt = world.tickDuration;
    const ids = world.query(Position, Velocity);
    for (const id of ids) {
      const pos = world.get(Position, id);
      const vel = world.get(Velocity, id);
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;
      pos.z += vel.z * dt;
    }
  },
};
