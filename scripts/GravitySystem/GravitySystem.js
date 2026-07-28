// constant acceleration applied to every non-kinematic entity each tick.
// `entities.gravity` overrides `strength`; set `direction` for non-downward gravity.
globalThis.GravitySystem = {
  /** @type {number} px/s²; overridden per-store by `entities.gravity`. */
  strength: 9.8,
  /** @type {{x:number,y:number,z:number}} unit direction (default down). */
  direction: { x: 0, y: 1, z: 0 },

  /** @param {Entity} entities */
  update(entities) {
    const strength = entities.gravity ?? this.strength;
    const { direction } = this;
    const dt = SimClock.tickDuration;
    const ids = entities.query(Velocity);
    for (const id of ids) {
      const col = entities.get(Collision, id);
      if (col && col.kinematic) continue;
      const vel = entities.get(Velocity, id);
      vel.x += direction.x * strength * dt;
      vel.y += direction.y * strength * dt;
      vel.z += direction.z * strength * dt;
    }
  },
};
