/** Re-fires each SoundEmitter's cue at its Position — once per frame, after the sim. */
globalThis.SoundEmitterSystem = {
  /**
   * On world time, so pause and dilation silence it. The timer resets rather than carrying the
   * remainder, so a fast-forward caps at one cue per frame. An unknown sound detaches the
   * component (fail fast, no per-interval spam).
   */
  update(level) {
    const entities = level.entities;
    entities.forEach([SoundEmitter, Position], (id, se, pos) => {
      se.timer = (se.timer ?? se.every) - Time.delta;
      if (se.timer > 0) return;
      se.timer = se.every;
      const sound = asset_get_index(se.sound);
      if (!audio_exists(sound)) {
        Log.warn(`SoundEmitter: unknown sound "${se.sound}" — detached`);
        entities.detach(id, SoundEmitter);
        return;
      }
      Audio.play({
        sound,
        gain: se.gain,
        position: { x: pos.x, y: pos.y },
      });
    });
  },
};
