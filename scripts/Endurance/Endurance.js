// Drains stamina while sprinting and regenerates it otherwise, at the rates the component
// carries; the max-stamina stat caps the pool.
globalThis.Endurance = {
  /**
   * `wantSprint` is the intent; returns whether the entity actually sprints. Fields are read live,
   * never cached in a bool local (docs/GMRT.md).
   */
  sprint(entities, id, wantSprint) {
    const sta = entities.get(id, Stamina);
    if (sta === undefined) return false;
    const stats = entities.get(id, Stats);
    const max = stats !== undefined ? stats.maxStamina : 100;
    const dt = Time.step;

    if (wantSprint && !sta.exhausted && sta.value > 0) {
      sta.value -= sta.drain * dt;
      if (sta.value <= 0) {
        sta.value = 0;
        sta.exhausted = true; // locked out until recovered to `recover` * max
      }
      return true;
    }

    if (sta.value < max) {
      sta.value += sta.regen * dt;
      if (sta.value > max) sta.value = max;
    }
    if (sta.exhausted && sta.value >= max * sta.recover) sta.exhausted = false;
    return false;
  },
};
