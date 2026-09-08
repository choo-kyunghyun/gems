globalThis.Time = {
  /** Wall-clock seconds since last frame (ignores `scale`). */
  raw: 0,
  /** 0 = paused, 1 = normal, >1 = fast-forward. */
  scale: 1,
  /**
   * The music's factor on sim time (1 = none), composed with `scale` so a pause or the bed
   * fast-forward stays orthogonal to it: a timed BGM runs the WHOLE world at its beat — the tick
   * rate follows, since SimClock drains `delta`. The scene that plays the music writes it
   * (sceneColony.update, from SoundMeta.bpm over Music.track) and resets it on destroy.
   */
  tempo: 1,
  /** `raw * scale * tempo` — sim time. */
  delta: 0,
  /** Frames since boot (1 on the first stepped frame; never pauses or dilates). */
  frame: 0,

  update() {
    Time.raw = delta_time / 1000000;
    Time.delta = Time.raw * Time.scale * Time.tempo;
    Time.frame += 1;
  },
};
