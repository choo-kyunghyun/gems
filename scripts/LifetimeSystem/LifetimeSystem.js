globalThis.LifetimeSystem = {
  update(entities) {
    const ids = entities.query(Lifetime);
    for (const id of ids) {
      const lt = entities.get(id, Lifetime);
      lt.ticks -= 1;
      if (lt.ticks <= 0) entities.remove(id);
    }
  },
};
