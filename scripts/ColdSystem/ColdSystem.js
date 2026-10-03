// Cold driver: the debuff holds while the body feels its threshold or less.
globalThis.ColdSystem = {
  update(level) {
    const entities = level.entities;
    entities.forEach([Cold, Position], (id, c) => {
      if (Shelter.felt(level, id) <= c.threshold) Effects.apply(entities, id, c.status);
      else Effects.remove(entities, id, c.status);
    });
  },
};
