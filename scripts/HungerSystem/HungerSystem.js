// Per-tick driver for the Hunger need — thin wrapper over the shared Survival core (its own object
// so a future hunger-specific rule has a home). update() runs in the scene's tick loop; restore()
// is the eat action (ConsumableSystem routes a food item here). Plain system object.
globalThis.HungerSystem = {
  update(world) {
    Survival.tick(world, Hunger);
  },

  // Eat: lower hunger by `amount` on entity `id`. Returns true if it changed (so eating while full
  // is refused, not wasted); refreshes the debuff so dropping below critical clears it at once.
  restore(world, id, amount) {
    const c = world.get(Hunger, id);
    const changed = Survival.restore(c, amount);
    if (changed) Survival.refresh(world, id, c);
    return changed;
  },
};
