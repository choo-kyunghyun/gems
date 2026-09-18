// The on-demand verbs over a need meter, and the "meter + critical debuff" core every need
// driver shares: restore (drink/eat/sleep), set (a respawn's refill), step (an environmental
// driver's signed move — ExposureSystem/ColdSystem), refresh (the debuff off the threshold),
// fraction (the HUD). The clock rise is NeedSystem's. Stat-model-agnostic: a critical need's
// consequence is a Status (dot/mult, no recompute).
globalThis.Needs = {
  /**
   * Lower `token`'s need on `id` by `amount` (drink/eat/sleep), clamped at 0, and refresh its debuff
   * so dropping below critical clears it at once. Returns true if it changed, so a no-op consumable
   * or station visit can be refused (see Consumption, contentInteractions); false without the need.
   */
  restore(entities, id, token, amount) {
    const c = entities.get(id, token);
    if (c === undefined || c.value <= 0) return false;
    c.value -= amount;
    if (c.value < 0) c.value = 0;
    Needs.refresh(entities, id, c);
    return true;
  },

  /**
   * Put `token`'s need on `id` AT `value` (clamped 0..max — a respawn's half refill) and refresh
   * its debuff. False without the need.
   */
  set(entities, id, token, value) {
    const c = entities.get(id, token);
    if (c === undefined) return false;
    c.value = value < 0 ? 0 : value > c.max ? c.max : value;
    Needs.refresh(entities, id, c);
    return true;
  },

  /**
   * Per tick for an ENVIRONMENTAL need (Exposure/Cold): move `value` by a signed `rate` — rising in
   * a hostile place, recovering in a safe one — clamped 0..max, then refresh the debuff.
   */
  step(entities, id, comp, rate) {
    comp.value += rate * Time.step;
    if (comp.value > comp.max) comp.value = comp.max;
    else if (comp.value < 0) comp.value = 0;
    Needs.refresh(entities, id, comp);
  },

  /**
   * Apply/remove the critical debuff Status by value vs threshold. apply()/remove() are idempotent +
   * cheap, so calling each tick is fine; "" status = no debuff.
   */
  refresh(entities, id, comp) {
    if (comp.status === "") return;
    if (comp.max > 0 && comp.value / comp.max >= comp.critical)
      Effects.apply(entities, id, comp.status);
    else Effects.remove(entities, id, comp.status);
  },

  /** fill fraction value/max (0 = fine, 1 = critical). The HUD shows the reserve (1 - this). */
  fraction(comp) {
    if (comp === undefined || comp.max <= 0) return 0;
    return comp.value / comp.max;
  },
};
