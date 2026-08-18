globalThis.LifetimeSystem = {
  update(entities) {
    entities.forEach([Lifetime], (id, lt) => {
      lt.ticks -= 1;
      if (lt.ticks <= 0) entities.remove(id);
    });
  },
};
