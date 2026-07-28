/**
 * @typedef {Object} SoundStruct
 * @property {GMSound} sound
 * @property {number} [priority=0]
 * @property {boolean} [loop=false]
 * @property {number} [gain=1.0]
 * @property {number} [offset]
 * @property {number} [pitch=1.0]
 * @property {number} [listener_mask]
 * @property {*} [emitter]
 * @property {SoundPosition} [position]
 */

/**
 * @typedef {Object} SoundPosition
 * @property {number} x
 * @property {number} y
 * @property {number} [z=0]
 * @property {number} [falloff_ref]
 * @property {number} [falloff_max]
 * @property {number} [falloff_factor]
 */

/**
 * Audio. Sound playback + master mixing over built-in audio_* API
 */
globalThis.Audio = {
  _defaultGain: 1.0,
  falloff_ref: 96,
  falloff_max: 800,
  falloff_factor: 1.0,

  // Once at boot: falloff model (GM default "none" = no attenuation), the listener, saved volumes.
  // Category volume is folded by hand (master global, default gain per cue at spawn, music on the
  // live BGM instance) — no audio groups: a streamed BGM can't join one.
  init() {
    audio_falloff_set_model(audio_falloff_linear_distance_clamped);
    AudioListener.init();
    Audio.setMasterGain(Settings.get("volMaster"));
    Music.setGain(Settings.get("volMusic"));
    Audio.setDefaultGain(Settings.get("volSfx"));
  },

  // Stop everything on a base level swap (cues + BGM) — clean slate. NOT across a guest push / map
  // change (Music carries over); LevelManager._apply's destroying path only.
  restart() {
    audio_stop_all();
    Music.reset();
  },

  /**
   * Play a cue — a thin alias of audio_play_sound_ext: fold in the default gain, fill the
   * 32px-world falloff window for a positional cue, delegate. Mutates `params` in place
   * (gain fold + falloff fields) — pass a throwaway literal, not a shared struct. A `position`
   * makes the cue spatial (attenuated + panned by the listener); omit it for 2D (UI/global).
   * @param {SoundStruct} params @returns {*} sound instance handle, or -1
   */
  play(params) {
    if (!audio_exists(params.sound)) return -1; // false (never errors) on -1/undefined
    params.gain = (params.gain ?? 1.0) * Audio._defaultGain;
    // cast: lib.gml.d.js shadows `undefined`, so checkJs can't narrow the guard below
    const p = /** @type {SoundPosition} */ (params.position);
    if (p !== undefined) {
      p.z = p.z ?? 0;
      p.falloff_ref = p.falloff_ref ?? Audio.falloff_ref;
      p.falloff_max = p.falloff_max ?? Audio.falloff_max;
      p.falloff_factor = p.falloff_factor ?? Audio.falloff_factor;
    }
    return audio_play_sound_ext(params);
  },

  setDefaultGain(gain) {
    Audio._defaultGain = clamp(gain, 0, 1);
  },

  setMasterGain(gain) {
    audio_set_master_gain(0, clamp(gain, 0, 1)); // listener 0 — the default, the only one AudioListener drives
  },
};
