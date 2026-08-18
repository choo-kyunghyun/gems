// Shared "rising meter + critical debuff" core the three per-need systems (Thirst/Hunger/Drowsiness)
// delegate to. Stat-model-agnostic: a critical need's consequence is a Status (dot/mult, no recompute).
globalThis.Survival = {
  /**
   * Per tick: raise every `token`-carrying entity's `value` by rate*dt (clamped), then refresh its debuff.
   */
  tick(entities, token) {
    const dt = SimClock.tickDuration;
    entities.forEach([token], (id, c) => {
      c.value += c.rate * dt;
      if (c.value > c.max) c.value = c.max;
      Survival.refresh(entities, id, c);
    });
  },

  /**
   * Lower a need by `amount` (drink/eat/sleep), clamped at 0. Returns true if it changed, so a no-op
   * consumable can be refused (see ConsumableSystem). The SYSTEM wrappers refresh() after a true result.
   */
  restore(comp, amount) {
    if (comp === undefined || comp.value <= 0) return false;
    comp.value -= amount;
    if (comp.value < 0) comp.value = 0;
    return true;
  },

  /**
   * Apply/remove the critical debuff Status by value vs threshold. apply()/remove() are idempotent +
   * cheap, so calling each tick is fine; "" status = no debuff.
   */
  refresh(entities, id, comp) {
    if (comp.status === "") return;
    if (comp.max > 0 && comp.value / comp.max >= comp.critical)
      StatusSystem.apply(entities, id, comp.status);
    else StatusSystem.remove(entities, id, comp.status);
  },

  /** fill fraction value/max (0 = fine, 1 = critical). The HUD shows the reserve (1 - this). */
  fraction(comp) {
    if (comp === undefined || comp.max <= 0) return 0;
    return comp.value / comp.max;
  },
};
