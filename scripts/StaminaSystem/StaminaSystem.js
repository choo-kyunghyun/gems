// drains Stamina while sprinting, regenerates otherwise. driven once per tick by RpgController.update
// (named-method system, not auto-run by World). Stats.maxStamina caps the pool.
globalThis.StaminaSystem = {
  DRAIN: 34, // stamina/sec spent while sprinting (~3s from full)
  REGEN: 22, // stamina/sec recovered while not sprinting (~4.5s to full)
  RECOVER: 0.3, // when emptied, sprint unlocks once stamina refills to this fraction of max

  // `wantSprint` = intent; gates on stamina/exhaustion here. returns true when actually sprinting.
  // reads component fields live (no cached boolean — GMRT boolean-local clobber, see CLAUDE.md).
  sprint(world, id, wantSprint) {
    const sta = world.get(Stamina, id);
    if (sta === undefined) return false;
    const stats = world.get(Stats, id);
    const max = stats !== undefined ? stats.maxStamina : 100;
    const dt = world.tickDuration;

    if (wantSprint && !sta.exhausted && sta.value > 0) {
      sta.value -= this.DRAIN * dt;
      if (sta.value <= 0) {
        sta.value = 0;
        sta.exhausted = true; // lock out sprint until recovered to RECOVER * max
      }
      return true;
    }

    if (sta.value < max) {
      sta.value += this.REGEN * dt;
      if (sta.value > max) sta.value = max;
    }
    if (sta.exhausted && sta.value >= max * this.RECOVER) sta.exhausted = false;
    return false;
  },
};
