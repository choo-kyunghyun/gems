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

globalThis.Audio = {
  _defaultGain: 1.0,
  /** Live spatial-cue emitter/instance pairs — reaped by update(). */
  _emitters: [],
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
   * Reap spatial-cue emitters whose voice has ended. Called once per frame (Game Step_0):
   * audio_emitter_free STOPS a still-playing voice at once, so play() parks each throwaway
   * emitter here until its cue finishes instead of freeing at fire time.
   */
  update() {
    const list = Audio._emitters;
    for (let i = list.length - 1; i >= 0; i--) {
      if (audio_is_playing(list[i].h)) continue;
      audio_emitter_free(list[i].em);
      list.splice(i, 1);
    }
  },

  /**
   * Stop everything on a scene swap (cues + BGM) — clean slate. NOT across a guest push / map
   * change (Music carries over); the Game object's destroying swap only.
   */
  restart() {
    audio_stop_all();
    // every spatial-cue voice just died with the stop — free their emitters now
    for (let i = 0; i < Audio._emitters.length; i++)
      audio_emitter_free(Audio._emitters[i].em);
    Audio._emitters = [];
    Music.reset();
  },

  /**
   * Play a cue. A `position` makes the cue spatial (attenuated + panned by the listener,
   * defaulting to the 32px-world falloff window above); omit it for 2D (UI/global). Spatial
   * cues route through a THROWAWAY EMITTER — audio_play_sound_ext's `position` sub-struct is
   * inert on GMRT (docs/GMRT.md) — honoring sound/loop/priority/gain/pitch; `offset` and
   * `listener_mask` are 2D-only. Mutates `params` in place (gain fold) — pass a throwaway
   * literal, not a shared struct.
   * Returns the sound instance handle, or -1.
   */
  play(params) {
    if (!audio_exists(params.sound)) return -1;
    params.gain = (params.gain ?? 1.0) * Audio._defaultGain;
    const p = params.position;
    if (p === undefined) return audio_play_sound_ext(params);
    const em = audio_emitter_create();
    audio_emitter_position(em, p.x, p.y, p.z ?? 0);
    audio_emitter_falloff(
      em,
      p.falloff_ref ?? Audio.falloff_ref,
      p.falloff_max ?? Audio.falloff_max,
      p.falloff_factor ?? Audio.falloff_factor,
    );
    audio_emitter_gain(em, params.gain);
    if (params.pitch !== undefined) audio_emitter_pitch(em, params.pitch);
    const h = audio_play_sound_on(
      em,
      params.sound,
      params.loop ?? false,
      params.priority ?? 0,
    );
    Audio._emitters.push({ em: em, h: h }); // freed by update() once the cue ends
    return h;
  },

  setDefaultGain(gain) {
    Audio._defaultGain = clamp(gain, 0, 1);
  },

  setMasterGain(gain) {
    audio_set_master_gain(0, clamp(gain, 0, 1));
  },
};
