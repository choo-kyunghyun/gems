/**
 * Audio — sound playback + master mixing over GameMaker's audio_* API (one
 * audio space); family head over AudioListener (ears) + Music (BGM).
 */

/**
 * The audio_play_sound_ext params struct (a JS object IS its GML struct).
 * @typedef {Object} SoundStruct
 * @property {GMSound} sound
 * @property {number} [priority=0]
 * @property {boolean} [loop=false]
 * @property {number} [gain=1.0]
 * @property {number} [offset] seconds; defaults to the asset-level offset
 * @property {number} [pitch=1.0]
 * @property {number} [listener_mask] bitmask; defaults to the emitter-level/global listener mask
 * @property {*} [emitter] audio emitter handle
 * @property {SoundPosition} [position]
 */

/**
 * @typedef {Object} SoundPosition World-px 3D position + falloff window of a spatial cue.
 * @property {number} x
 * @property {number} y
 * @property {number} [z=0]
 * @property {number} [falloff_ref]
 * @property {number} [falloff_max]
 * @property {number} [falloff_factor]
 */

globalThis.Audio = {
  _defaultGain: 1.0,
  FALLOFF_REF: 96,
  FALLOFF_MAX: 800,
  FALLOFF_FACTOR: 1.0,

  // Once at boot: falloff model (GM default "none" = no attenuation), the listener, saved volumes.
  // Category volume is folded by hand (master global, default gain per cue at spawn, music on the
  // live BGM instance) — no audio groups: a streamed BGM can't join one.
  setup() {
    audio_falloff_set_model(audio_falloff_linear_distance_clamped);
    AudioListener.setup();
    Audio.setMasterGain(Settings.get("volMaster"));
    Music.setGain(Settings.get("volMusic"));
    Audio.setDefaultGain(Settings.get("volSfx"));
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
      p.falloff_ref = p.falloff_ref ?? Audio.FALLOFF_REF;
      p.falloff_max = p.falloff_max ?? Audio.FALLOFF_MAX;
      p.falloff_factor = p.falloff_factor ?? Audio.FALLOFF_FACTOR;
    }
    return audio_play_sound_ext(params);
  },

  setDefaultGain(gain) {
    Audio._defaultGain = clamp(gain, 0, 1);
  },

  setMasterGain(gain) {
    audio_set_master_gain(0, clamp(gain, 0, 1)); // listener 0 — the default, the only one AudioListener drives
  },

  // Stop everything on a base level swap (cues + BGM) — clean slate. NOT across a guest push / map
  // change (Music carries over); LevelManager._apply's destroying path only.
  reset() {
    audio_stop_all();
    Music.reset();
  },
};
