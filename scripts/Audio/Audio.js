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

/**
 * The cue player and the ears over GameMaker's audio engine, and the boot of the audio family.
 * Volume is three live gains — master, SFX group, track group — and a group's gain covers every
 * sound in it, playing or not, so a slider never has to find the instances. Only the default
 * group loads on its own, so init loads the others, and a play before its group lands answers -1.
 */
globalThis.Audio = {
  falloff_ref: 128,
  falloff_max: 960,
  falloff_factor: 1.0,

  init() {
    audio_falloff_set_model(audio_falloff_linear_distance_clamped);
    // top-down, so only x drives the pan (+x = right)
    audio_listener_orientation(0, 0, 1, 0, -1, 0);
    audio_group_load(audiogroup_sfx);
    audio_group_load(audiogroup_track);
    Audio.setMasterGain(Settings.get("volMaster"));
    Audio.setSfxGain(Settings.get("volSfx"));
    Music.setGain(Settings.get("volMusic"));
  },

  /** The group load is asynchronous. */
  loaded(sound) {
    return audio_group_is_loaded(audio_sound_get_audio_group(sound));
  },

  /** A clean slate for a destroying scene swap only; music carries over any other change. */
  restart() {
    audio_stop_all();
    Music.reset();
  },

  /**
   * A `position` makes the cue spatial; without one it is 2D. Neither path uses
   * audio_play_sound_ext, which drops `position` (docs/GMRT.md). Returns the sound instance, or -1.
   */
  play(params) {
    if (!audio_exists(params.sound) || !Audio.loaded(params.sound)) return -1;
    const gain = params.gain ?? 1.0;
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
    // set after the fact: both play calls take the mask as their last argument, but an absent
    // mask means the global one, which has no value to pass in its place
    if (params.listener_mask !== undefined)
      audio_sound_set_listener_mask(h, params.listener_mask);
    return h;
  },

  /** Per frame; the caller owns whose position the ears track. */
  listen(x, y) {
    audio_listener_position(x, y, 0);
  },

  /** 0..1, over every group. */
  setMasterGain(gain) {
    audio_set_master_gain(0, clamp(gain, 0, 1));
  },

  /** 0..1; a group gain, so a cue already playing follows it too. */
  setSfxGain(gain) {
    audio_group_set_gain(audiogroup_sfx, clamp(gain, 0, 1), 0);
  },
};
