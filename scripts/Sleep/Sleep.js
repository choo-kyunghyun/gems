/**
 * The bed's fast-forward: while asleep, Time.scale eases up to a ceiling and the sleeper's
 * Drowsiness drains, until its holder wakes it. It skips time cheaply because the world clocks
 * consume the whole scaled delta while the entity sim integrates the capped Time.step, so hours
 * pass while a body moves one bounded step a frame. The sleep record `{ on, peaked }` is its
 * holder's and dies with it.
 */
globalThis.Sleep = {
  SCALE_MAX: 50, // Time.scale ceiling
  ACCEL: 0.5, // ramp growth per wall-second (multiplicative, on Time.raw)
  RECOVER: 40, // Drowsiness drained per sim-second, over its clock rise

  make() {
    return { on: false, peaked: false };
  },

  /** The other needs keep rising at the fast-forwarded rate. */
  start(rec) {
    rec.on = true;
    rec.peaked = false;
  },

  /** Back to full speed; returns whether it was asleep. */
  wake(rec) {
    if (!rec.on) return false;
    rec.on = false;
    Time.scale = 1;
    return true;
  },

  /**
   * Per frame, before the sim: ramp on Time.raw (wall clock — Time.delta is itself scaled), so
   * the fast-forward eases in instead of snapping. Hitting the ceiling is the time-skip trigger,
   * reported once per sleep.
   */
  ramp(rec, entities) {
    if (!rec.on) return;
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

  /** Per frame, after the needs rise: the sleeper rests. */
  rest(rec, entities, id) {
    if (!rec.on) return;
    Needs.restore(entities, id, Drowsiness, Sleep.RECOVER * Time.step);
  },
};
