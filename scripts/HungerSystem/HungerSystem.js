// Hunger need driver — thin wrapper over the shared Survival core (own object so a hunger-specific rule
// has a home). update() in the tick loop; restore() is the eat action (ConsumableSystem routes here).
globalThis.HungerSystem = {
  update(world) {
    Survival.tick(world, Hunger);
  },

  // Eat: lower hunger by `amount`. Returns true if it changed (eating while full is refused); refreshes
  // the debuff so dropping below critical clears it at once.
  restore(world, id, amount) {
    const c = world.get(Hunger, id);
    const changed = Survival.restore(c, amount);
    if (changed) Survival.refresh(world, id, c);
    return changed;
  },
};
