// The survival-need ticker and the "rising meter + critical debuff" core the environmental
// systems (ExposureSystem/ColdSystem, through step) share. update() walks the Need registry in
// order, after the room mirror is synced (RoomSystem.sync — the environmental needs read it).
// Stat-model-agnostic: a critical need's consequence is a Status (dot/mult, no recompute).
globalThis.NeedSystem = {
  /**
   * Per tick, every registered need: its own system's update(level) when it names one, else the
   * clock rise — every carrier's `value` up by rate*dt (clamped), then its debuff refreshed.
   */
  update(level) {
    const entities = level.entities;
    const dt = Time.step;
    const needs = Need.all();
    for (let i = 0; i < needs.length; i++) {
      const need = needs[i];
      if (need.system !== undefined) {
        need.system.update(level);
        continue;
      }
      entities.forEach([need.id], (id, c) => {
        c.value += c.rate * dt;
        if (c.value > c.max) c.value = c.max;
        NeedSystem.refresh(entities, id, c);
      });
    }
  },

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
    NeedSystem.refresh(entities, id, c);
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
    NeedSystem.refresh(entities, id, comp);
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
