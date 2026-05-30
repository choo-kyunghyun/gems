globalThis.MovementSystem = class MovementSystem {
  static update() {
    for (let i = 0; i < Velocity.data.length; i++) {
      const vel = Velocity.data[i];
      if (vel === undefined) continue;
      const pos = Position.data[i];
      if (pos === undefined) continue;

      pos.x += vel.vx;
      pos.y += vel.vy;
      pos.z += vel.vz;

      vel.vx *= vel.friction;
      vel.vy *= vel.friction;
      vel.vz *= vel.friction;
    }
  }
};
