// On-demand sprint resource: drains Stamina while sprinting, regenerates it otherwise. Driven
// once per tick by the mover (RpgController.update) — a plain system object with a named method
// (the project's System pattern, like EncumbranceSystem), not auto-run by World. Only entities
// carrying a Stamina component participate; Stats.maxStamina caps the pool.
globalThis.StaminaSystem = {
  DRAIN: 34, // stamina/sec spent while sprinting (~3s from full)
  REGEN: 22, // stamina/sec recovered while not sprinting (~4.5s to full)
  RECOVER: 0.3, // when emptied, sprint unlocks once stamina refills to this fraction of max

  // Advance one tick. `wantSprint` is the player's intent (sprint key held + moving); the
  // stamina/exhaustion gate is decided here. Mutates the Stamina component and returns true
  // when actually sprinting this tick, so the mover applies the speed boost. Drains toward 0
  // while sprinting, regenerates toward max otherwise. Reads the component fields live each use
  // (no cached boolean — see the GMRT boolean-local clobber note in CLAUDE.md).
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
