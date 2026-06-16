/**
 * Counts down each entity's `Lifetime.ticks` and removes it (deferred) at 0 — the
 * despawn timer for bullets, effects, and other transient entities.
 */
globalThis.LifetimeSystem = {
  /** @param {World} world */
  update(world) {
    const ids = world.query(Lifetime);
    for (const id of ids) {
      const lt = world.get(Lifetime, id);
      lt.ticks -= 1;
      if (lt.ticks <= 0) world.remove(id);
    }
  },
};
