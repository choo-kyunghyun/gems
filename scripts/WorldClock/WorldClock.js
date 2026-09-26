// The in-game clock: the time of day and day counter every time-aware feature reads. One world
// record, advanced on sim time; it persists across map changes and rides the save.
globalThis.WorldClock = {
  KEY: "clock", // the record's key on the world entity; a save holds it
  dayLength: 240, // real seconds for one full in-game day (at Time.scale 1)
  startHour: 8, // morning when a fresh world starts

  /** The clock record — `{ hour in [0, 24), day 1-based }` — seeded at the starting morning of day 1. */
  state() {
    return World.active.of(WorldClock.KEY, () => ({
      hour: WorldClock.startHour,
      day: 1,
    }));
  },

  /**
   * Advance by `dt` sim seconds, rolling the day at each midnight; a big hitch can cross more
   * than one. BUG: `while`, not an empty-init `for` (docs/GMRT.md #15566).
   */
  update(dt) {
    const c = WorldClock.state();
    c.hour += (24 / WorldClock.dayLength) * dt;
    while (c.hour >= 24) {
      c.hour -= 24;
      c.day += 1;
    }
  },

  /**
   * Absolute in-game hours since day 1, 00:00 — a monotonic timeline for scheduling.
   */
  absHours() {
    const c = WorldClock.state();
    return (c.day - 1) * 24 + c.hour;
  },

  clockText() {
    const hour = WorldClock.state().hour;
    const h = Math.floor(hour);
    const m = Math.floor((hour - h) * 60);
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  },
};
