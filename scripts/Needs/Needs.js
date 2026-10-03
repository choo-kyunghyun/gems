/**
 * The on-demand verbs over a need meter, and its meter-plus-critical-debuff core; the clock rise
 * is not here. Stat-model-agnostic: a critical need's consequence
 * is a Status.
 */
globalThis.Needs = {
  /**
   * Lower the need, clamped at 0; dropping below critical clears the debuff at once. Returns true
   * if it changed, so a no-op consumable or station visit can be refused; false without the need.
   */
  restore(entities, id, token, amount) {
    const c = entities.get(id, token);
    if (c === undefined || c.value <= 0) return false;
    c.value -= amount;
    if (c.value < 0) c.value = 0;
    Needs.refresh(entities, id, c);
    return true;
  },

  /** Clamped 0..max; refreshes the debuff. False without the need. */
  set(entities, id, token, value) {
    const c = entities.get(id, token);
    if (c === undefined) return false;
    c.value = value < 0 ? 0 : value > c.max ? c.max : value;
    Needs.refresh(entities, id, c);
    return true;
  },

  /** Idempotent and cheap, so fine each tick; "" status = no debuff. */
  refresh(entities, id, comp) {
    if (comp.status === "") return;
    if (comp.max > 0 && comp.value / comp.max >= comp.critical)
      Effects.apply(entities, id, comp.status);
    else Effects.remove(entities, id, comp.status);
  },

  /** 0 = fine, 1 = full. */
  fraction(comp) {
    if (comp === undefined || comp.max <= 0) return 0;
    return comp.value / comp.max;
  },
};
