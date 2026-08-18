// integrates velocity for free movers only — solids use SolidSystem, projectiles use ProjectileSystem.
globalThis.MovementSystem = {
  update(entities) {
    const dt = SimClock.tickDuration;
    entities.forEach([Position, Velocity], (id, pos, vel) => {
      pos.x += vel.x * dt;
      pos.y += vel.y * dt;
      pos.z += vel.z * dt;
    });
  },
};
