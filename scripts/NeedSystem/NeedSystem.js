// The survival-need ticker: every registered need rises on the clock, or runs its own driver
// (ExposureSystem/ColdSystem). update() walks the Need registry in order, after the room mirror
// is synced (RoomSystem.update — the environmental needs read it). The verbs over a meter
// (restore/set/step/refresh/fraction) are Needs'.
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
        Needs.refresh(entities, id, c);
      });
    }
  },
};
