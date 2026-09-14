// drains Stamina while sprinting, regenerates otherwise — at the rates the component carries.
// driven once per tick by PlayerSystem. Stats.maxStamina caps the pool.
globalThis.Endurance = {
  /**
   * `wantSprint` = intent; gates on stamina/exhaustion here. returns true when actually sprinting.
   * reads component fields live (no cached boolean — GMRT boolean-local clobber, see CLAUDE.md).
   */
  sprint(entities, id, wantSprint) {
    const sta = entities.get(id, Stamina);
    if (sta === undefined) return false;
    const stats = entities.get(id, Stats);
    const max = stats !== undefined ? stats.maxStamina : 100;
    const dt = SimClock.tickDuration;

    if (wantSprint && !sta.exhausted && sta.value > 0) {
      sta.value -= sta.drain * dt;
      if (sta.value <= 0) {
        sta.value = 0;
        sta.exhausted = true; // lock out sprint until recovered to `recover` * max
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
