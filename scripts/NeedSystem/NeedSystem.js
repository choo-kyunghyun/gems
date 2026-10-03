/** The survival-need ticker: every registered need rises on the clock, in registry order. */
globalThis.NeedSystem = {
  update(level) {
    const entities = level.entities;
    const dt = Time.step;
    const needs = Need.all();
    for (let i = 0; i < needs.length; i++) {
      entities.forEach([needs[i].id], (id, c) => {
        c.value += c.rate * dt;
        if (c.value > c.max) c.value = c.max;
        Needs.refresh(entities, id, c);
      });
    }
  },
};
