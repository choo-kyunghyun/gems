/**
 * Audio — SFX playback + master mixing over GameMaker's audio_* API (one audio space).
 * Sibling modules: AudioListener (ears), Music (BGM). Contracts: utilities.md → Audio.
 */
globalThis.Audio = class Audio {
  static _sfxGain = 1.0; // SFX category volume (0..1), folded into each play/playAt at spawn

  // Linear-clamped falloff window (world px): full volume within REF, silent past MAX.
  static REF = 96; // 3 cells @ 32px
  static MAX = 800; // ~25 cells
  static FACTOR = 1.0; // 1 = reach silence exactly at MAX

  // Once at boot: falloff model (GM default "none" = no attenuation), the listener, saved volumes.
  static setup() {
    audio_falloff_set_model(audio_falloff_linear_distance_clamped);
    AudioListener.setup();
    Audio.setMasterGain(Settings.get("volMaster"));
    Music.setGain(Settings.get("volMusic"));
    Audio.setSfxGain(Settings.get("volSfx"));
  }

  // Non-positional SFX (UI, global). opts: { gain, pitch, loop, priority }. Returns handle, or -1.
  static play(sound, opts) {
    if (!audio_exists(sound)) return -1; // audio_exists returns false (never errors) on -1/undefined
    opts = opts ?? {};
    const g = (opts.gain ?? 1.0) * Audio._sfxGain;
    return audio_play_sound(
      sound,
      opts.priority ?? 1,
      opts.loop ?? false,
      g,
      0,
      opts.pitch ?? 1,
    );
  }

  // Spatial SFX at world (x, y) — attenuated + panned by the listener. opts adds { ref, max, factor }
  // to override the falloff window. Returns the handle.
  static playAt(sound, x, y, opts) {
    if (!audio_exists(sound)) return -1;
    opts = opts ?? {};
    const g = (opts.gain ?? 1.0) * Audio._sfxGain;
    return audio_play_sound_at(
      sound,
      x,
      y,
      0,
      opts.ref ?? Audio.REF,
      opts.max ?? Audio.MAX,
      opts.factor ?? Audio.FACTOR,
      opts.loop ?? false,
      opts.priority ?? 1,
      g,
      0,
      opts.pitch ?? 1,
    );
  }

  static setSfxGain(g) {
    Audio._sfxGain = g < 0 ? 0 : g > 1 ? 1 : g; // folded in at play (cues brief — not retro-adjusted)
  }

  static setMasterGain(g) {
    audio_master_gain(g < 0 ? 0 : g > 1 ? 1 : g);
  }

  // Stop everything on a base scene swap (SFX + BGM) — clean slate. NOT across a guest push / map
  // change (Music carries over); LevelManager._apply's destroying path only.
  static reset() {
    audio_stop_all();
    Music.reset();
  }
};
