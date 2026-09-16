/**
 * The frame clock — the one source of "how much time passed" for every consumer, split by what
 * it measures:
 *   raw    wall-clock seconds since last frame; UI timers and easing (menus keep moving while
 *          the sim is paused)
 *   delta  sim seconds — `raw * scale * tempo`; the world clocks (WorldClock, Weather) and the
 *          world-space effects, so a pause or a fast-forward reaches them whole
 *   step   the entity sim's integration step this frame — `delta` capped at `maxStep`, so a
 *          hitch or the bed's fast-forward (Time.scale up to 50) never moves a body farther
 *          than one bounded step while the world clocks still consume the whole `delta`
 * The entity systems (`*System.update`, the brains' cooldowns) integrate by `step`; nothing runs
 * more than once per frame, so a frame's work is one step whatever the refresh rate, and the
 * per-frame cost is flat (a slow frame takes a bigger step, never more steps).
 */
globalThis.Time = {
  /** Wall-clock seconds since last frame (ignores `scale`). */
  raw: 0,
  /** 0 = paused, 1 = normal, >1 = fast-forward. */
  scale: 1,
  /**
   * The music's factor on sim time (1 = none), composed with `scale` so a pause or the bed
   * fast-forward stays orthogonal to it: a timed BGM runs the WHOLE world at its beat. The scene
   * that plays the music writes it (sceneColony.update, its `tempo` rule over Music.track) and
   * resets it on destroy; the player's Radio picks the track, and with it the rate.
   */
  tempo: 1,
  /** `raw * scale * tempo` — sim time. */
  delta: 0,
  /** `delta` capped at `maxStep` — what the entity sim integrates this frame. */
  step: 0,
  /** Ceiling on `step` (s): the longest single integration a frame may take. */
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
