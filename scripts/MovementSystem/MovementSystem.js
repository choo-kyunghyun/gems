// integrates velocity for free movers only — solids use SolidSystem, projectiles use ProjectileSystem.
globalThis.MovementSystem = {
  update(entities) {
    const dt = SimClock.tickDuration;
    const ids = entities.query(Position, Velocity);
    for (const id of ids) {
      const pos = entities.get(Position, id);
      const vel = entities.get(Velocity, id);
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;
      pos.z += vel.z * dt;
    }
  },
};
