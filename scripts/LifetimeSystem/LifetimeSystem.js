// despawn timer for transient entities (bullets, effects).
globalThis.LifetimeSystem = {
  update(world) {
    const ids = world.query(Lifetime);
    for (const id of ids) {
      const lt = world.get(Lifetime, id);
      lt.ticks -= 1;
      if (lt.ticks <= 0) world.remove(id);
    }
  },
};
