/**
 * Looping BGM with cross-fade. Music volume is the track group's gain; the instance gain carries
 * only the track's own level and its fade. A track requested before its group has loaded is
 * queued and starts from update() the frame the group lands.
 */
globalThis.Music = {
  PRIORITY: 10, // above the cues: a burst past the voice limit culls a cue, never the bed
  _bgm: -1, // -1 = none, or the request still queued
  _bgmAsset: -1, // the requested track, -1 = none
  _opts: null, // kept for a queued start
  _fadeStop: -1, // a faded-out handle awaiting its stop
  _fadeAt: 0, // current_time (ms) to stop _fadeStop at

  /**
   * A missing asset stops the BGM. Re-requesting the current track is a no-op, so it is safe per
   * frame. Returns the BGM instance, or -1 (none, or queued on its group's load).
   */
  play(sound, opts) {
    opts = opts ?? {};
    if (!audio_exists(sound)) {
      Music.stop(opts.fadeMs);
      return -1;
    }
    if (
      sound === Music._bgmAsset &&
      (Music._bgm === -1 || audio_is_playing(Music._bgm))
    )
      return Music._bgm; // playing, fading in, or queued
    Music._fadeOut(opts.fadeMs ?? 600);
    Music._bgm = -1;
    Music._bgmAsset = sound;
    Music._opts = opts;
    return Music._start();
  },

  /** -1 while the group is not in memory; update() retries. */
  _start() {
    const sound = Music._bgmAsset;
    if (!Audio.loaded(sound)) return -1;
    const opts = Music._opts;
    const fade = opts.fadeMs ?? 600;
    const g = opts.gain ?? 1.0;
    const h = audio_play_sound(
      sound,
      Music.PRIORITY,
      true,
      fade > 0 ? 0 : g,
      0,
      opts.pitch ?? 1,
    );
    if (fade > 0) audio_sound_gain(h, g, fade);
    Music._bgm = h;
    return h;
  },

  /**
   * The requested track, or -1. Cleared the moment a fade-out begins, so a consumer keyed on it
   * lets go with the track, not with its tail.
   */
  track() {
    return Music._bgmAsset;
  },

  stop(fadeMs) {
    Music._fadeOut(fadeMs ?? 400);
    Music._bgm = -1;
    Music._bgmAsset = -1;
  },

  /** 0 stops at once; otherwise update() stops it once the fade elapses. */
  _fadeOut(fadeMs) {
    if (Music._bgm === -1 || !audio_is_playing(Music._bgm)) return;
    if (Music._fadeStop !== -1 && Music._fadeStop !== Music._bgm)
      audio_stop_sound(Music._fadeStop); // an older pending fade, already silent
    if (fadeMs > 0) {
      audio_sound_gain(Music._bgm, 0, fadeMs);
      Music._fadeStop = Music._bgm;
      Music._fadeAt = current_time + fadeMs;
    } else {
      audio_stop_sound(Music._bgm);
      Music._fadeStop = -1;
    }
  },

  /** Per frame; cheap when idle. */
  update() {
    if (Music._fadeStop !== -1 && current_time >= Music._fadeAt) {
      audio_stop_sound(Music._fadeStop);
      Music._fadeStop = -1;
    }
    if (Music._bgm === -1 && Music._bgmAsset !== -1) Music._start();
  },

  /** A hard stop and clear; stop() is the graceful path. */
  reset() {
    if (Music._bgm !== -1) audio_stop_sound(Music._bgm);
    if (Music._fadeStop !== -1) audio_stop_sound(Music._fadeStop);
    Music._bgm = -1;
    Music._bgmAsset = -1;
    Music._fadeStop = -1;
  },
};
