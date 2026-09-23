/**
 * The survival-need ticker: every registered need rises on the clock or runs its own driver, in
 * registry order. Runs after the room state is synced, which the environmental needs read.
 */
globalThis.NeedSystem = {
  update(level) {
    const entities = level.entities;
    const dt = Time.step;
    const needs = Need.all();
    for (let i = 0; i < needs.length; i++) {
      const need = needs[i];
      if (need.system !== undefined) {
        need.system.update(level);
        continue;
      }
      entities.forEach([need.id], (id, c) => {
        c.value += c.rate * dt;
        if (c.value > c.max) c.value = c.max;
        Needs.refresh(entities, id, c);
      });
    }
  },
};
