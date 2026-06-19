// Shared core for the survival needs (Thirst/Hunger/Drowsiness) — the generic "rising meter +
// critical debuff" logic the three per-need systems delegate to, so each system stays a thin,
// distinct object without duplicating the loop. A free-function bucket (the project's category-bucket
// pattern). Stat-model-agnostic: the consequence of a critical need is a Status (the component's
// `status` id), applied/removed through the Buff/Status kit — no recompute, since survival debuffs
// carry dot/mult, not flat mods.
globalThis.Survival = {
  // Advance every entity carrying `token` (a need component) one tick: raise `value` by rate*dt
  // (clamped to max), then refresh its critical debuff. Driven from the scene's tick loop.
  tick(world, token) {
    const dt = world.tickDuration;
    const ids = world.query(token);
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const c = world.get(token, id);
      c.value += c.rate * dt;
      if (c.value > c.max) c.value = c.max;
      Survival.refresh(world, id, c);
    }
  },

  // Lower a need by `amount` (drink/eat/sleep), clamped at 0. Returns true if it actually changed
  // (value was above 0), so a consumable that would do nothing (need already satisfied) can be
  // refused — see ConsumableSystem. `comp` may be undefined (entity lacks the need) → false. The
  // SYSTEM wrappers call refresh() after a true result, so a restore clears the debuff immediately
  // (matters when the per-tick update is bypassed — e.g. draining Drowsiness while asleep).
  restore(comp, amount) {
    if (comp === undefined || comp.value <= 0) return false;
    comp.value -= amount;
    if (comp.value < 0) comp.value = 0;
    return true;
  },

  // Apply or remove the need's critical debuff Status by its current value/threshold. Called after
  // any change to the meter (tick raise, or a restore) so the debuff tracks the value immediately.
  // apply()/remove() are idempotent + cheap, so calling each tick is fine; "" status = no debuff.
  refresh(world, id, comp) {
    if (comp.status === "") return;
    if (comp.max > 0 && comp.value / comp.max >= comp.critical)
      StatusSystem.apply(world, id, comp.status);
    else StatusSystem.remove(world, id, comp.status);
  },

  // Need fill fraction, value/max (0 = fine, 1 = critical). The HUD shows the reserve (1 - this).
  fraction(comp) {
    if (comp === undefined || comp.max <= 0) return 0;
    return comp.value / comp.max;
  },
};
