// Hunger need driver — thin wrapper over the shared Survival core (own object so a hunger-specific rule
// has a home). update() in the tick loop; restore() is the eat action (ConsumableSystem routes here).
globalThis.HungerSystem = {
  update(entities) {
    Survival.tick(entities, Hunger);
  },

  // Eat: lower hunger by `amount`. Returns true if it changed (eating while full is refused); refreshes
  // the debuff so dropping below critical clears it at once.
  restore(entities, id, amount) {
    const c = entities.get(Hunger, id);
    const changed = Survival.restore(c, amount);
    if (changed) Survival.refresh(entities, id, c);
    return changed;
  },
};
