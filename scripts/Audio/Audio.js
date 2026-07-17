/**
 * Audio — thin static facade over GameMaker's audio_* API (one audio space); the sound wrapper.
 * Contracts + wiring: docs/architecture/utilities.md → Audio.
 */
globalThis.Audio = class Audio {
  static _bgm = -1; // current looping BGM handle (-1 = none)
  static _bgmAsset = -1; // currently-playing track's asset (-1 = none); a re-request is a no-op
  static _bgmGain = 1.0; // the track's base gain (opts.gain); music volume multiplies this
  static _fadeStop = -1; // a faded-out BGM handle awaiting its stop
  static _fadeAt = 0; // Time.raw (s) at which to stop _fadeStop

  // Category volumes (0..1), folded in by hand — no audio groups (utilities.md → Audio).
  static _musicGain = 1.0;
  static _sfxGain = 1.0;

  // Linear-clamped falloff window (world px): full volume within REF, silent past MAX.
  static REF = 96; // 3 cells @ 32px
  static MAX = 800; // ~25 cells
  static FACTOR = 1.0; // 1 = reach silence exactly at MAX

  // Once at boot: falloff model (GM default "none" = no attenuation), listener orientation, volumes.
  static setup() {
    audio_falloff_set_model(audio_falloff_linear_distance_clamped);
    // 2D top-down: up = -y (GM y grows down) so only x drives L/R pan (+x → RIGHT). Set once.
    audio_listener_orientation(0, 0, 1, 0, -1, 0);
    Audio.setMasterGain(Settings.get("volMaster"));
    Audio.setMusicGain(Settings.get("volMusic"));
    Audio.setSfxGain(Settings.get("volSfx"));
  }

  // Non-positional SFX (UI, global). opts: { gain, pitch, loop, priority }. Returns handle, or -1.
  static play(sound, opts) {
    if (!audio_exists(sound)) return -1; // audio_exists returns false (never errors) on -1/undefined
    opts = opts === undefined ? {} : opts;
    const g = (opts.gain === undefined ? 1.0 : opts.gain) * Audio._sfxGain;
    return audio_play_sound(
      sound,
      opts.priority === undefined ? 1 : opts.priority,
      opts.loop === undefined ? false : opts.loop,
      g,
      0,
      opts.pitch === undefined ? 1 : opts.pitch,
    );
  }

  // Spatial SFX at world (x, y) — attenuated + panned by the listener. opts adds { ref, max, factor }
  // to override the falloff window. Returns the handle.
  static playAt(sound, x, y, opts) {
    if (!audio_exists(sound)) return -1;
    opts = opts === undefined ? {} : opts;
    const g = (opts.gain === undefined ? 1.0 : opts.gain) * Audio._sfxGain;
    return audio_play_sound_at(
      sound,
      x,
      y,
      0,
      opts.ref === undefined ? Audio.REF : opts.ref,
      opts.max === undefined ? Audio.MAX : opts.max,
      opts.factor === undefined ? Audio.FACTOR : opts.factor,
      opts.loop === undefined ? false : opts.loop,
      opts.priority === undefined ? 1 : opts.priority,
      g,
      0,
      opts.pitch === undefined ? 1 : opts.pitch,
    );
  }

  // Move the listener (the player's "ears"). z is fixed at 0; orientation was set in setup().
  static listener(x, y) {
    audio_listener_position(x, y, 0);
  }

  // Start/switch the looping BGM, cross-faded over opts.fadeMs (default 600); a missing asset stops
  // it. Re-requesting the playing track is a no-op (safe per frame). opts: { gain, pitch, fadeMs }.
  static bgm(sound, opts) {
    opts = opts === undefined ? {} : opts;
    if (!audio_exists(sound)) {
      Audio.stopBgm(opts.fadeMs);
      return -1;
    }
    if (
      sound === Audio._bgmAsset &&
      Audio._bgm !== -1 &&
      audio_is_playing(Audio._bgm)
    )
      return Audio._bgm; // already playing this track
    const fade = opts.fadeMs === undefined ? 600 : opts.fadeMs;
    Audio._fadeOutCurrent(fade);
    Audio._bgmGain = opts.gain === undefined ? 1.0 : opts.gain;
    const g = Audio._bgmGain * Audio._musicGain; // fold music volume into the instance gain
    const h = audio_play_sound(
      sound,
      0,
      true,
      fade > 0 ? 0 : g,
      0,
      opts.pitch === undefined ? 1 : opts.pitch,
    );
    if (fade > 0) audio_sound_gain(h, g, fade); // ramp in over `fade` ms (instant if unsupported)
    Audio._bgm = h;
    Audio._bgmAsset = sound;
    return h;
  }

  // Fade the BGM out and stop it. fadeMs default 400.
  static stopBgm(fadeMs) {
    Audio._fadeOutCurrent(fadeMs === undefined ? 400 : fadeMs);
    Audio._bgm = -1;
    Audio._bgmAsset = -1;
  }

  // Ramp the current BGM to silence and schedule its stop (update() reaps it); 0 = hard stop now.
  static _fadeOutCurrent(fadeMs) {
    if (Audio._bgm === -1 || !audio_is_playing(Audio._bgm)) return;
    if (Audio._fadeStop !== -1 && Audio._fadeStop !== Audio._bgm)
      audio_stop_sound(Audio._fadeStop); // a still-pending older fade — drop it now (already silent)
    if (fadeMs > 0) {
      audio_sound_gain(Audio._bgm, 0, fadeMs);
      Audio._fadeStop = Audio._bgm;
      Audio._fadeAt = Time.raw + fadeMs / 1000;
    } else {
      audio_stop_sound(Audio._bgm);
      Audio._fadeStop = -1;
    }
  }

  // Per-frame (obj_game Step_0): stop a BGM whose fade-out has elapsed. Cheap no-op when idle.
  static update() {
    if (Audio._fadeStop !== -1 && Time.raw >= Audio._fadeAt) {
      audio_stop_sound(Audio._fadeStop);
      Audio._fadeStop = -1;
    }
  }

  // Live category-volume setters (0..1), folded by hand — no audio groups (utilities.md → Audio).
  static setMusicGain(g) {
    Audio._musicGain = g < 0 ? 0 : g > 1 ? 1 : g;
    if (Audio._bgm !== -1 && audio_is_playing(Audio._bgm))
      audio_sound_gain(Audio._bgm, Audio._bgmGain * Audio._musicGain, 50); // ramp avoids a drag-click
  }

  static setSfxGain(g) {
    Audio._sfxGain = g < 0 ? 0 : g > 1 ? 1 : g; // folded in at play (cues brief — not retro-adjusted)
  }

  static setMasterGain(g) {
    audio_master_gain(g < 0 ? 0 : g > 1 ? 1 : g);
  }

  // Stop everything on a base scene swap (BGM + pending fade + lingering SFX) — clean slate.
  static reset() {
    audio_stop_all();
    Audio._bgm = -1;
    Audio._bgmAsset = -1;
    Audio._fadeStop = -1;
  }
};
