globalThis.Time = {
  /** Wall-clock seconds since last frame (ignores `scale`). */
  raw: 0,
  /** 0 = paused, 1 = normal, >1 = fast-forward. */
  scale: 1,
  /** `raw * scale` — sim time. */
  delta: 0,
  /** Frames since boot (1 on the first stepped frame; never pauses or dilates). */
  frame: 0,

  update() {
    Time.raw = delta_time / 1000000;
    Time.delta = Time.raw * Time.scale;
    Time.frame += 1;
  },
};
