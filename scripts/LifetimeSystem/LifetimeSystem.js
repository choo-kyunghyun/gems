globalThis.LifetimeSystem = {
  update(level) {
    const entities = level.entities;
    entities.forEach([Lifetime], (id, lt) => {
      lt.secs -= Time.step;
      if (lt.secs <= 0) entities.remove(id);
    });
  },
};
