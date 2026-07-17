/**
 * Audio — static-singleton facade over GameMaker's audio_* API (one audio space, like ParticleFx).
 * Plays the audio-kit's GMSound assets three ways: play (non-positional 2D), playAt (spatial), bgm
 * (looping, cross-faded; re-request = no-op).
 *
 * Spatial needs a listener + distance model, both owned here: setup() picks a falloff model (GM
 * default is none = no attenuation) + fixes the listener orientation once; listener(x,y) moves the
 * ears each frame. Wiring mirrors ParticleFx: setup in Create_0, update in Step_0 (reaps BGM fades),
 * reset in SceneManager._apply only (NOT across a guest push / map change — music carries over).
 *
 * GMRT (see CLAUDE.md): asset_get_index returns an OPAQUE ref (not-found = -1) — validate via
 * audio_exists, never a >=0 test (_asset early-returns on -1 so audio_exists only sees real assets).
 * State is read-write static FIELDS + plain METHODS — house style (static getters are safe on 0.20).
 */
globalThis.Audio = class Audio {
  static _bgm = -1; // current looping BGM handle (-1 = none)
  static _bgmName = ""; // its asset name — re-requesting the same track is a no-op
  static _bgmGain = 1.0; // the track's base gain (opts.gain); music volume multiplies this
  static _fadeStop = -1; // a faded-out BGM handle awaiting its stop
  static _fadeAt = 0; // Time.raw (s) at which to stop _fadeStop

  // Category volumes (0..1), applied by hand since there are NO audio groups (streamed BGM can't
  // join one — manual). Master is global; music rides the live BGM instance; sfx folds in at play.
  static _musicGain = 1.0;
  static _sfxGain = 1.0;

  // Linear-clamped falloff window (world px): full volume within REF, silent past MAX.
  static REF = 96; // 3 cells @ 32px
  static MAX = 800; // ~25 cells
  static FACTOR = 1.0; // 1 = reach silence exactly at MAX

  // Once at boot: distance model (GM default is "none" = no spatialisation), listener orientation,
  // saved volumes.
  static setup() {
    audio_falloff_set_model(audio_falloff_linear_distance_clamped);
    // 2D top-down: face +z, up = -y (GM y grows down) so +x emitters pan RIGHT — only x drives L/R
    // pan, y maps to front/back. Fixed once; position updates per frame.
    audio_listener_orientation(0, 0, 1, 0, -1, 0);
    // No audio GROUPS: all snd_*/mus_* sit in audiogroup_default (always loaded, no load call), so
    // category volume is folded in by hand below — don't reintroduce group gain.
    Audio.setMasterGain(Settings.get("volMaster"));
    Audio.setMusicGain(Settings.get("volMusic"));
    Audio.setSfxGain(Settings.get("volSfx"));
  }

  // Resolve "snd_x" (or a raw handle) to a valid sound asset, else -1. Guards -1 so audio_exists
  // is never asked about a non-asset (it errors on bad ids).
  static _asset(sound) {
    const a = typeof sound === "string" ? asset_get_index(sound) : sound;
    if (a === -1 || a === undefined) return -1;
    return audio_exists(a) ? a : -1;
  }

  // Non-positional SFX (UI, global). opts: { gain, pitch, loop, priority }. Returns handle, or -1.
  static play(sound, opts) {
    const a = Audio._asset(sound);
    if (a === -1) return -1;
    opts = opts === undefined ? {} : opts;
    const g = (opts.gain === undefined ? 1.0 : opts.gain) * Audio._sfxGain;
    return audio_play_sound(
      a,
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
    const a = Audio._asset(sound);
    if (a === -1) return -1;
    opts = opts === undefined ? {} : opts;
    const g = (opts.gain === undefined ? 1.0 : opts.gain) * Audio._sfxGain;
    return audio_play_sound_at(
      a,
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

  // Start / switch the looping BGM, cross-fading over opts.fadeMs (default 600). Re-requesting the
  // playing track is a no-op (safe to call every frame). opts: { gain, pitch, fadeMs }. Missing
  // asset stops the BGM.
  static bgm(sound, opts) {
    opts = opts === undefined ? {} : opts;
    const a = Audio._asset(sound);
    if (a === -1) {
      Audio.stopBgm(opts.fadeMs);
      return -1;
    }
    const name = typeof sound === "string" ? sound : audio_get_name(a);
    if (
      name === Audio._bgmName &&
      Audio._bgm !== -1 &&
      audio_is_playing(Audio._bgm)
    )
      return Audio._bgm; // already playing this track
    const fade = opts.fadeMs === undefined ? 600 : opts.fadeMs;
    Audio._fadeOutCurrent(fade);
    Audio._bgmGain = opts.gain === undefined ? 1.0 : opts.gain;
    const g = Audio._bgmGain * Audio._musicGain; // fold music volume into the instance gain
    const h = audio_play_sound(
      a,
      0,
      true,
      fade > 0 ? 0 : g,
      0,
      opts.pitch === undefined ? 1 : opts.pitch,
    );
    if (fade > 0) audio_sound_gain(h, g, fade); // ramp in over `fade` ms (instant if unsupported)
    Audio._bgm = h;
    Audio._bgmName = name;
    return h;
  }

  // Fade the BGM out and stop it. fadeMs default 400.
  static stopBgm(fadeMs) {
    Audio._fadeOutCurrent(fadeMs === undefined ? 400 : fadeMs);
    Audio._bgm = -1;
    Audio._bgmName = "";
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

  // Live category-volume setters (0..1). No audio groups (streamed BGM can't join one), so each is
  // applied by hand: music ramps the live BGM instance over 50ms (avoids a drag-click); sfx just
  // stores the level, folded into every play/playAt at spawn (cues are brief — no retro-adjust).
  static setMusicGain(g) {
    Audio._musicGain = g < 0 ? 0 : g > 1 ? 1 : g;
    if (Audio._bgm !== -1 && audio_is_playing(Audio._bgm))
      audio_sound_gain(Audio._bgm, Audio._bgmGain * Audio._musicGain, 50);
  }

  static setSfxGain(g) {
    Audio._sfxGain = g < 0 ? 0 : g > 1 ? 1 : g;
  }

  static setMasterGain(g) {
    audio_master_gain(g < 0 ? 0 : g > 1 ? 1 : g);
  }

  // Stop everything on a base scene swap (BGM + pending fade + lingering SFX) — clean slate.
  static reset() {
    audio_stop_all();
    Audio._bgm = -1;
    Audio._bgmName = "";
    Audio._fadeStop = -1;
  }
};
