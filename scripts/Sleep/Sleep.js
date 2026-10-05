/**
 * The bed's fast-forward: while a body is Asleep, Time.scale eases up to a ceiling and its
 * Drowsiness drains, until it wakes. It skips time cheaply because the world clocks consume the
 * whole scaled delta while the entity sim integrates the capped Time.step, so hours pass while a
 * body moves one bounded step a frame.
 */
globalThis.Sleep = {
  SCALE_MAX: 50, // Time.scale ceiling
  ACCEL: 0.5, // ramp growth per wall-second (multiplicative, on Time.raw)
  RECOVER: 40, // Drowsiness drained per sim-second, over its clock rise

  /** The other needs keep rising at the fast-forwarded rate. */
  start(entities, id) {
    entities.add(id, Asleep, { peaked: false });
  },

  /** Back to full speed; returns whether it was asleep. */
  wake(entities, id) {
    if (!entities.has(id, Asleep)) return false;
    entities.detach(id, Asleep);
    Time.scale = 1;
    return true;
  },

  /**
   * Ramp on Time.raw (wall clock — Time.delta is itself scaled), so the fast-forward eases in
   * instead of snapping. Hitting the ceiling is the time-skip trigger, reported once per sleep.
   */
  ramp(entities, rec) {
    const s = Math.max(1, Time.scale) * (1 + Sleep.ACCEL * Time.raw);
    if (s < Sleep.SCALE_MAX) {
      Time.scale = s;
      return;
    }
    Time.scale = Sleep.SCALE_MAX;
    if (rec.peaked) return;
    rec.peaked = true;
    Progression.report(entities, "sleepSkip", "", 1);
  },

  /** After the needs rise: the sleeper rests. */
  rest(entities, id) {
    Needs.restore(entities, id, Drowsiness, Sleep.RECOVER * Time.step);
  },
};
