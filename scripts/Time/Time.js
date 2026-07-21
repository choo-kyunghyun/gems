// Frame clock. UI reads `raw` (wall-clock); sim/gameplay reads `delta` (scaled), so menus stay
// responsive when the sim dilates or pauses.
globalThis.Time = {
  /** @type {number} wall-clock seconds since last frame (ignores `scale`). */
  raw: 0,
  /** @type {number} 0 = paused, 1 = normal, >1 = fast-forward. */
  scale: 1,
  /** @type {number} `raw * scale` — sim time. */
  delta: 0,
  /** @type {number} frames since boot (1 on the first stepped frame; never pauses or dilates). */
  frame: 0,

  /** Advance the clock from `delta_time` (µs). */
  update() {
    Time.raw = delta_time / 1000000;
    Time.delta = Time.raw * Time.scale;
    Time.frame += 1;
  },
};
