/**
 * Music — looping BGM with cross-fade (a state machine over audio_play_sound + audio_sound_gain).
 * Music volume is audiogroup_track's gain (setGain); the instance gain carries only the track's
 * own level and its fade. A track requested before its group has loaded (Audio.init loads it
 * asynchronously) is queued and starts from update() the frame the group lands.
 * Wired in Game Step_0 (update) + Audio.restart.
 */
globalThis.Music = {
  PRIORITY: 10, // above the cues' 0: a burst past the voice limit culls a cue, never the bed
  _bgm: -1, // current looping BGM instance handle (-1 = none, or the request below still queued)
  _bgmAsset: -1, // the requested track asset (-1 = none); a re-request of the same track is a no-op
  _opts: null, // the request's { gain, pitch, fadeMs }, kept for a queued start
  _fadeStop: -1, // a faded-out BGM handle awaiting its stop
  _fadeAt: 0, // current_time (ms) at which to stop _fadeStop (Time.raw is a per-frame DELTA, not a clock)

  /**
   * Start/switch the looping BGM, cross-faded over opts.fadeMs (default 600); a missing asset stops
   * it. Re-requesting the requested track is a no-op (safe per frame). opts: { gain, pitch, fadeMs }.
   * Returns the BGM instance handle, or -1 (none, or queued on its group's load).
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

  /**
   * Start the requested track if its group is in memory — else -1, and update() retries.
   */
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
    if (fade > 0) audio_sound_gain(h, g, fade); // ramp in over `fade` ms (instant if unsupported)
    Music._bgm = h;
    return h;
  },

  /**
   * The BGM asset requested (looping, fading in, or queued), or -1 — the same-track check `play`
   * runs on. Cleared the moment stop/reset begins the fade-out, so a consumer keyed on it (the
   * sim tempo) lets go with the track, not with its tail.
   */
  track() {
    return Music._bgmAsset;
  },

  /**
   * Fade the BGM out and stop it. fadeMs default 400.
   */
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

  /**
   * Per-frame (Game Step_0): stop a BGM whose fade-out has elapsed, and start a queued track once
   * its group has landed. Cheap no-op when idle.
   */
  update() {
    if (Music._fadeStop !== -1 && current_time >= Music._fadeAt) {
      audio_stop_sound(Music._fadeStop);
      Music._fadeStop = -1;
    }
    if (Music._bgm === -1 && Music._bgmAsset !== -1) Music._start();
  },

  /**
   * Music volume (0..1): audiogroup_track's gain, ramped over 50ms (avoids a drag-click).
   */
  setGain(g) {
    audio_group_set_gain(audiogroup_track, clamp(g, 0, 1), 50);
  },

  /**
   * Hard stop + clear on a base level swap (via Audio.restart). Graceful stop() is the per-scene path.
   */
  reset() {
    if (Music._bgm !== -1) audio_stop_sound(Music._bgm);
    if (Music._fadeStop !== -1) audio_stop_sound(Music._fadeStop);
    Music._bgm = -1;
    Music._bgmAsset = -1;
    Music._fadeStop = -1;
  },
};
