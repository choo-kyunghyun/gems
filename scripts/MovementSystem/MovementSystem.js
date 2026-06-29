// integrates velocity for free movers only — solids use SolidSystem, projectiles use ProjectileSystem.
globalThis.MovementSystem = {
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
