globalThis.GravitySystem = {
  strength: 9.8,
  direction: { x: 0, y: 1, z: 0 },

  update(world) {
    const { strength, direction } = this;
    const dt = world.tickDuration;
    const ids = world.query(Velocity);
    for (const id of ids) {
      const vel = world.get(Velocity, id);
      vel.x += direction.x * strength * dt;
      vel.y += direction.y * strength * dt;
      vel.z += direction.z * strength * dt;
    }
  },
};
