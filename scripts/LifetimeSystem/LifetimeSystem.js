// despawn timer for transient entities (bullets, effects).
globalThis.LifetimeSystem = {
  update(entities) {
    const ids = entities.query(Lifetime);
    for (const id of ids) {
      const lt = entities.get(Lifetime, id);
      lt.ticks -= 1;
      if (lt.ticks <= 0) entities.remove(id);
    }
  },
};
