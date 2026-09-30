// Spends stamina a dodge at a time and regenerates it continuously, at the rates the component
// carries; the max-stamina stat caps the pool.
globalThis.Endurance = {
  /** Pay one dodge's cost; false, spending nothing, without Stamina or short of the cost. */
  spend(entities, id) {
    const sta = entities.get(id, Stamina);
    if (sta === undefined) return false;
    if (sta.value < sta.cost) return false;
    sta.value -= sta.cost;
    return true;
  },

  /** Once per step. */
  regen(entities, id) {
    const sta = entities.get(id, Stamina);
    if (sta === undefined) return;
    const stats = entities.get(id, Stats);
    const max = stats !== undefined ? stats.maxStamina : 100;
    if (sta.value < max) {
      sta.value += sta.regen * Time.step;
      if (sta.value > max) sta.value = max;
    }
  },
};
