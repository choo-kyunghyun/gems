// Thirst need driver — thin wrapper over the shared Survival core (own object so a thirst-specific rule
// has a home). update() in the tick loop; restore() is the drink action (ConsumableSystem routes here).
globalThis.ThirstSystem = {
  update(world) {
    Survival.tick(world, Thirst);
  },

  // Drink: lower thirst by `amount`. Returns true if it changed (a full-up drink is refused); refreshes
  // the debuff so dropping below critical clears it at once.
  restore(world, id, amount) {
    const c = world.get(Thirst, id);
    const changed = Survival.restore(c, amount);
    if (changed) Survival.refresh(world, id, c);
    return changed;
  },
};
