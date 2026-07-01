// constant acceleration applied to every non-kinematic entity each tick.
// `world.gravity` overrides `strength`; set `direction` for non-downward gravity.
globalThis.GravitySystem = {
  /** @type {number} px/s²; overridden per-world by `world.gravity`. */
  strength: 9.8,
  /** @type {{x:number,y:number,z:number}} unit direction (default down). */
  direction: { x: 0, y: 1, z: 0 },

  /** @param {ECS} world */
  update(world) {
    const strength = world.gravity ?? this.strength;
    const { direction } = this;
    const dt = world.tickDuration;
    const ids = world.query(Velocity);
    for (const id of ids) {
      const col = world.get(Collision, id);
      if (col && col.kinematic) continue;
      const vel = world.get(Velocity, id);
      vel.x += direction.x * strength * dt;
      vel.y += direction.y * strength * dt;
      vel.z += direction.z * strength * dt;
    }
  },
};
