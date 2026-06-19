// Per-tick driver for the Thirst need — thin wrapper over the shared Survival core (its own object
// so a future thirst-specific rule has a home). update() runs in the scene's tick loop; restore()
// is the drink action (ConsumableSystem routes a water item here). Plain system object.
globalThis.ThirstSystem = {
  update(world) {
    Survival.tick(world, Thirst);
  },

  // Drink: lower thirst by `amount` on entity `id`. Returns true if it changed (so a full-up drink
  // is refused, not wasted); refreshes the debuff so dropping below critical clears it at once.
  restore(world, id, amount) {
    const c = world.get(Thirst, id);
    const changed = Survival.restore(c, amount);
    if (changed) Survival.refresh(world, id, c);
    return changed;
  },
};
