// Shared "rising meter + critical debuff" core the three per-need systems (Thirst/Hunger/Drowsiness)
// delegate to. Stat-model-agnostic: a critical need's consequence is a Status — no recompute, since
// survival debuffs carry dot/mult, not flat mods.
globalThis.Survival = {
  // Per tick: raise every `token`-carrying entity's `value` by rate*dt (clamped), then refresh its debuff.
  tick(world, token) {
    const dt = World.sim.tickDuration;
    const ids = world.query(token);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const c = world.get(token, id);
      c.value += c.rate * dt;
      if (c.value > c.max) c.value = c.max;
      Survival.refresh(world, id, c);
    }
  },

  // Lower a need by `amount` (drink/eat/sleep), clamped at 0. Returns true if it changed, so a no-op
  // consumable can be refused (see ConsumableSystem). The SYSTEM wrappers refresh() after a true result.
  restore(comp, amount) {
    if (comp === undefined || comp.value <= 0) return false;
    comp.value -= amount;
    if (comp.value < 0) comp.value = 0;
    return true;
  },

  // Apply/remove the critical debuff Status by value vs threshold. apply()/remove() are idempotent +
  // cheap, so calling each tick is fine; "" status = no debuff.
  refresh(world, id, comp) {
    if (comp.status === "") return;
    if (comp.max > 0 && comp.value / comp.max >= comp.critical)
      StatusSystem.apply(world, id, comp.status);
    else StatusSystem.remove(world, id, comp.status);
  },

  // fill fraction value/max (0 = fine, 1 = critical). The HUD shows the reserve (1 - this).
  fraction(comp) {
    if (comp === undefined || comp.max <= 0) return 0;
    return comp.value / comp.max;
  },
};
