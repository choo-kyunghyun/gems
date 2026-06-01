globalThis.Movement = class Movement {
  static update(world, deltaTime) {
    const entities = world.query(Position, Velocity);
    for (const entity of entities) {
        const pos = world.get(Position, entity);
        const vel = world.get(Velocity, entity);
        
        pos.x += vel.x;
        pos.y += vel.y;
        pos.z += vel.z;
    }
  }
};
