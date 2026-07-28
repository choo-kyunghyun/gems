/**
 * Music — looping BGM with cross-fade (a state machine over audio_play_sound + audio_sound_gain).
 * Wired in obj_game Step_0 (update) + Audio.restart.
 */
globalThis.Music = {
  _bgm: -1, // current looping BGM instance handle (-1 = none)
  _bgmAsset: -1, // its track asset (-1 = none); a re-request of the same track is a no-op
  _bgmGain: 1.0, // the track's base gain (opts.gain); music volume multiplies this
  _fadeStop: -1, // a faded-out BGM handle awaiting its stop
  _fadeAt: 0, // current_time (ms) at which to stop _fadeStop (Time.raw is a per-frame DELTA, not a clock)
  _gain: 1.0, // music category volume (0..1), folded into the instance gain

  /**
   * Start/switch the looping BGM, cross-faded over opts.fadeMs (default 600); a missing asset stops
   * it. Re-requesting the playing track is a no-op (safe per frame). opts: { gain, pitch, fadeMs }.
   */
  play(sound, opts) {
    opts = opts ?? {};
    if (!audio_exists(sound)) {
      Music.stop(opts.fadeMs);
      return -1;
    }
    if (
      sound === Music._bgmAsset &&
      Music._bgm !== -1 &&
      audio_is_playing(Music._bgm)
    )
      return Music._bgm; // already playing this track
    const fade = opts.fadeMs ?? 600;
    Music._fadeOut(fade);
    Music._bgmGain = opts.gain ?? 1.0;
    const g = Music._bgmGain * Music._gain; // fold music volume into the instance gain
    const h = audio_play_sound(
      sound,
      0,
      true,
      fade > 0 ? 0 : g,
      0,
      opts.pitch ?? 1,
    );
    if (fade > 0) audio_sound_gain(h, g, fade); // ramp in over `fade` ms (instant if unsupported)
    Music._bgm = h;
    Music._bgmAsset = sound;
    return h;
  },

  /** Fade the BGM out and stop it. fadeMs default 400. */
  stop(fadeMs) {
    Music._fadeOut(fadeMs ?? 400);
    Music._bgm = -1;
    Music._bgmAsset = -1;
  },

  /**
   * Ramp the current BGM to silence and schedule its stop (update() reaps it); 0 = hard stop now.
   */
  _fadeOut(fadeMs) {
    if (Music._bgm === -1 || !audio_is_playing(Music._bgm)) return;
    if (Music._fadeStop !== -1 && Music._fadeStop !== Music._bgm)
      audio_stop_sound(Music._fadeStop); // a still-pending older fade — drop it now (already silent)
    if (fadeMs > 0) {
      audio_sound_gain(Music._bgm, 0, fadeMs);
      Music._fadeStop = Music._bgm;
      Music._fadeAt = current_time + fadeMs;
    } else {
      audio_stop_sound(Music._bgm);
      Music._fadeStop = -1;
    }
  },

  /** Per-frame (obj_game Step_0): stop a BGM whose fade-out has elapsed. Cheap no-op when idle. */
  update() {
    if (Music._fadeStop !== -1 && current_time >= Music._fadeAt) {
      audio_stop_sound(Music._fadeStop);
      Music._fadeStop = -1;
    }
  },

  /**
   * Live music-volume setter (0..1): ramps the playing instance over 50ms (avoids a drag-click).
   */
  setGain(g) {
    Music._gain = clamp(g, 0, 1);
    if (Music._bgm !== -1 && audio_is_playing(Music._bgm))
      audio_sound_gain(Music._bgm, Music._bgmGain * Music._gain, 50);
  },

  /**
   * Hard stop + clear on a base level swap (via Audio.restart). Graceful stop() is the per-level path.
   */
  reset() {
    if (Music._bgm !== -1) audio_stop_sound(Music._bgm);
    if (Music._fadeStop !== -1) audio_stop_sound(Music._fadeStop);
    Music._bgm = -1;
    Music._bgmAsset = -1;
    Music._fadeStop = -1;
  },
};
