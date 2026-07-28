// Thirst need driver — thin wrapper over the shared Survival core (own object so a thirst-specific rule
// has a home). update() in the tick loop; restore() is the drink action (ConsumableSystem routes here).
globalThis.ThirstSystem = {
  update(entities) {
    Survival.tick(entities, Thirst);
  },

  /**
   * Drink: lower thirst by `amount`. Returns true if it changed (a full-up drink is refused); refreshes
   * the debuff so dropping below critical clears it at once.
   */
  restore(entities, id, amount) {
    const c = entities.get(Thirst, id);
    const changed = Survival.restore(c, amount);
    if (changed) Survival.refresh(entities, id, c);
    return changed;
  },
};
