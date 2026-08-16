// Re-fires each SoundEmitter's cue at its Position — dispatch once per frame, outside the tick loop.
globalThis.SoundEmitterSystem = {
  /**
   * Counts down on Time.delta (world-space effect: pause/dilation silence it, per the clock
   * split). On fire the timer resets to `every` — never += the remainder — so a sleep
   * fast-forward caps at one cue per frame. An unknown sound name warns once and detaches
   * the component (fail fast, no per-interval spam).
   */
  update(entities) {
    const ids = entities.query(SoundEmitter, Position);
    for (const id of ids) {
      const se = entities.get(SoundEmitter, id);
      se.timer = (se.timer ?? se.every) - Time.delta;
      if (se.timer > 0) continue;
      se.timer = se.every;
      const sound = asset_get_index(se.sound);
      if (!audio_exists(sound)) {
        Log.warn(`SoundEmitter: unknown sound "${se.sound}" — detached`);
        entities.detach(id, SoundEmitter);
        continue;
      }
      const pos = entities.get(Position, id);
      Audio.play({
        sound,
        gain: se.gain ?? 1,
        position: { x: pos.x, y: pos.y },
      });
    }
  },
};
