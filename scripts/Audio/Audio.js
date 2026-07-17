/**
 * Audio — SFX playback + master mixing over GameMaker's audio_* API (one audio space).
 * Sibling modules: AudioListener (ears), Music (BGM). Contracts: utilities.md → Audio.
 */
globalThis.Audio = class Audio {
  static _sfxGain = 1.0; // SFX category volume (0..1), folded into each cue at spawn

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

  // Play an SFX cue — a thin alias of audio_play_sound_ext (a JS object IS its GML params struct):
  // fold in the SFX category gain, fill the 32px-world falloff window for a positional cue, delegate.
  // `params` is the native struct — { sound, gain?, pitch?, loop?, priority?, offset?, emitter?,
  // position?: { x, y, z?, falloff_ref?, falloff_max?, falloff_factor? } }. A `position` makes the cue
  // spatial (attenuated + panned by the listener); omit it for 2D (UI/global). Returns handle, or -1.
  static playSfx(params) {
    if (!audio_exists(params.sound)) return -1; // false (never errors) on -1/undefined
    params.gain = (params.gain ?? 1.0) * Audio._sfxGain;
    const p = params.position;
    if (p !== undefined) {
      p.z = p.z ?? 0;
      p.falloff_ref = p.falloff_ref ?? Audio.REF;
      p.falloff_max = p.falloff_max ?? Audio.MAX;
      p.falloff_factor = p.falloff_factor ?? Audio.FACTOR;
    }
    return audio_play_sound_ext(params);
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
