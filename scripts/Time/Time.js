/**
 * The frame clock — the one source of "how much time passed", split by what it measures:
 *   raw    wall-clock seconds; UI timers and easing, which keep moving while the sim is paused
 *   delta  sim seconds; the world clocks and world-space effects, so a pause or a fast-forward
 *          reaches them whole
 *   step   the entity sim's integration step — `delta` capped at `maxStep`, so a hitch or a
 *          fast-forward never moves a body farther than one bounded step while the world clocks
 *          still consume the whole `delta`
 * Nothing runs more than once per frame, so the per-frame cost is flat: a slow frame takes a
 * bigger step, never more steps.
 */
globalThis.Time = {
  /** Ignores `scale`. */
  raw: 0,
  /** 0 = paused, 1 = normal, >1 = fast-forward. */
  scale: 1,
  /**
   * The music's factor on sim time (1 = none), composed with `scale` so a pause or fast-forward
   * stays orthogonal to it: a timed track runs the whole world at its beat. The scene that sets it
   * resets it on destroy.
   */
  tempo: 1,
  delta: 0,
  step: 0,
  /** Ceiling on `step`, in seconds. */
  maxStep: 0.1,
  /** Frames since boot (1 on the first stepped frame; never pauses or dilates). */
  frame: 0,

  update() {
    Time.raw = delta_time / 1000000;
    Time.delta = Time.raw * Time.scale * Time.tempo;
    Time.step = Time.delta < Time.maxStep ? Time.delta : Time.maxStep;
    Time.frame += 1;
  },
};
