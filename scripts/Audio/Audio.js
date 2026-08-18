/**
 * @typedef {Object} SoundStruct
 * @property {GMSound} sound
 * @property {number} [priority=0]
 * @property {boolean} [loop=false]
 * @property {number} [gain=1.0]
 * @property {number} [offset=0]
 * @property {number} [pitch=1.0]
 * @property {number} [listener_mask]
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

globalThis.Audio = {
  _defaultGain: 1.0,
  falloff_ref: 128,
  falloff_max: 960,
  falloff_factor: 1.0,

  init() {
    audio_falloff_set_model(audio_falloff_linear_distance_clamped);
    AudioListener.init();
    Audio.setMasterGain(Settings.get("volMaster"));
    Music.setGain(Settings.get("volMusic"));
    Audio.setDefaultGain(Settings.get("volSfx"));
  },

  /**
   * Stop everything on a scene swap (cues + BGM) — clean slate. NOT across a guest push / map
   * change (Music carries over); the Game object's destroying swap only.
   */
  restart() {
    audio_stop_all();
    Music.reset();
  },

  /**
   * Play a cue. A `position` makes the cue spatial (attenuated + panned by the listener,
   * defaulting to the 32px-world falloff window above); omit it for 2D (UI/global). Both paths
   * honor every field — audio_play_sound_ext, the one call that takes the whole struct, drops
   * its `position` (docs/GMRT.md), so neither path goes through it.
   * Returns the sound instance handle, or -1.
   */
  play(params) {
    if (!audio_exists(params.sound)) return -1;
    const gain = (params.gain ?? 1.0) * Audio._defaultGain;
    const loop = params.loop ?? false;
    const priority = params.priority ?? 0;
    const offset = params.offset ?? 0;
    const pitch = params.pitch ?? 1.0;
    const p = params.position;
    const h =
      p === undefined
        ? audio_play_sound(params.sound, priority, loop, gain, offset, pitch)
        : audio_play_sound_at(
            params.sound,
            p.x,
            p.y,
            p.z ?? 0,
            p.falloff_ref ?? Audio.falloff_ref,
            p.falloff_max ?? Audio.falloff_max,
            p.falloff_factor ?? Audio.falloff_factor,
            loop,
            priority,
            gain,
            offset,
            pitch,
          );
    // set after the fact: the mask is the one tail argument both play calls would need padded
    if (params.listener_mask !== undefined)
      audio_sound_set_listener_mask(h, params.listener_mask);
    return h;
  },

  setDefaultGain(gain) {
    Audio._defaultGain = clamp(gain, 0, 1);
  },

  setMasterGain(gain) {
    audio_set_master_gain(0, clamp(gain, 0, 1));
  },
};
