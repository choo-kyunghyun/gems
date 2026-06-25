/**
 * Audio — the project's sound wrapper: a thin, genre-agnostic facade over GameMaker's
 * audio_* API. Standalone static singleton, like ParticleFx / FloatingText (one audio space).
 * Plays the audio-kit's GMSound assets (snd_* SFX, mus_* BGM) three ways:
 *
 *   Audio.play("snd_ui_confirm");              // non-positional 2D cue (UI, global)
 *   Audio.playAt("snd_shoot", x, y);           // SPATIAL: attenuated + panned by the listener
 *   Audio.bgm("mus_overworld");                // looping music, cross-faded; re-request = no-op
 *
 * Spatial audio (audio_play_sound_at) needs a listener + a distance model, both owned here:
 *   - setup() (obj_game Create_0) picks audio_falloff_linear_distance_clamped (the default model
 *     is audio_falloff_none = no attenuation) and fixes the 2D listener ORIENTATION once;
 *   - listener(x, y) (the RPG scene, each frame, from the camera centre) moves the listener's
 *     EARS so a sound to the player's right pans right and a distant one is quieter.
 *
 * Wiring (mirrors ParticleFx):
 *   - obj_game Create_0 → Audio.setup() (falloff model + orientation; LOADS the bgm/sfx audio groups
 *     + applies the saved Settings volumes as group gains — category volume is the AUDIO GROUP gain,
 *     so the SystemMenu sliders scale every playing sound in a group live via setMusicGain/setSfxGain);
 *   - obj_game Step_0   → Audio.update() (reaps a finished BGM cross-fade on Time.raw — wall-clock,
 *     so a paused sim doesn't freeze the fade);
 *   - SceneManager._apply → Audio.reset() (stop the looping BGM + all SFX on a base scene swap, so
 *     RPG music doesn't bleed into the lobby — NOT on a guest push or an RPG map change, where the
 *     music should carry over);
 *   - the RPG scene → Audio.listener(camera.toX, camera.toY) each frame.
 *
 * GMRT notes (see CLAUDE.md): asset_get_index returns an OPAQUE ref (a not-found name is -1) —
 * validate via audio_exists, never a >=0 test; _asset() early-returns on -1 so audio_exists is
 * only ever asked about a real asset. All state is read-write static FIELDS + plain METHODS (no
 * static getters — those miscompile on 0.20). Falloff numbers below suit the 16px-cell world.
 */
globalThis.Audio = class Audio {
  static _bgm = -1; // current looping BGM handle (-1 = none)
  static _bgmName = ""; // its asset name — re-requesting the same track is a no-op
  static _fadeStop = -1; // a faded-out BGM handle awaiting its stop
  static _fadeAt = 0; // Time.raw (s) at which to stop _fadeStop

  // Linear-clamped falloff window (world px): full volume within REF, silent past MAX.
  static REF = 48; // 3 cells @ 16px
  static MAX = 400; // ~25 cells
  static FACTOR = 1.0; // 1 = reach silence exactly at MAX

  // Call once at boot. Picks the distance model (the default is "none" = no spatialisation),
  // fixes the 2D listener orientation, LOADS the audio groups, and applies the saved volumes.
  static setup() {
    audio_falloff_set_model(audio_falloff_linear_distance_clamped);
    // 2D top-down: face into the screen (+z); up = -y (GM y grows downward) makes +x emitters
    // pan RIGHT. Only x then drives L/R pan; the y axis maps to front/back (no L/R skew), which
    // is exactly right for a top-down view. Position changes each frame; orientation is fixed.
    audio_listener_orientation(0, 0, 1, 0, -1, 0);
    // The snd_*/mus_* assets live in the `sfx`/`bgm` audio GROUPS, not the always-loaded default —
    // a non-default group must be LOADED (async) before its sounds can play. Done at boot, long
    // before any scene with sound opens. Category volume is then the group gain (setMusicGain/SfxGain).
    if (!audio_group_is_loaded(bgm)) audio_group_load(bgm);
    if (!audio_group_is_loaded(sfx)) audio_group_load(sfx);
    Audio.setMasterGain(Settings.get("volMaster"));
    Audio.setMusicGain(Settings.get("volMusic"));
    Audio.setSfxGain(Settings.get("volSfx"));
  }

  // Resolve "snd_x" (or a raw asset handle) to a valid sound asset, else -1. Guards the -1 so
  // audio_exists is never asked about a non-asset (the manual warns it errors on bad ids).
  static _asset(sound) {
    const a = typeof sound === "string" ? asset_get_index(sound) : sound;
    if (a === -1 || a === undefined) return -1;
    return audio_exists(a) ? a : -1;
  }

  // Non-positional SFX (UI, global cues). opts: { gain, pitch, loop, priority }. Returns the
  // playing-sound handle (or -1 if the asset is missing).
  static play(sound, opts) {
    const a = Audio._asset(sound);
    if (a === -1) return -1;
    opts = opts === undefined ? {} : opts;
    const g = opts.gain === undefined ? 1.0 : opts.gain; // category volume = the `sfx` group gain
    return audio_play_sound(
      a,
      opts.priority === undefined ? 1 : opts.priority,
      opts.loop === undefined ? false : opts.loop,
      g,
      0,
      opts.pitch === undefined ? 1 : opts.pitch,
    );
  }

  // Spatial SFX at world (x, y) — attenuated + panned relative to the listener (set per frame by
  // listener()). opts adds { ref, max, factor } to override the falloff window. Returns the handle.
  static playAt(sound, x, y, opts) {
    const a = Audio._asset(sound);
    if (a === -1) return -1;
    opts = opts === undefined ? {} : opts;
    const g = opts.gain === undefined ? 1.0 : opts.gain; // category volume = the `sfx` group gain
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
  // track that's already playing is a no-op (so a scene can call this every frame). opts: { gain,
  // pitch, fadeMs }. Pass a falsy / missing asset to stop the BGM.
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
    const g = opts.gain === undefined ? 1.0 : opts.gain; // category volume = the `bgm` group gain
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

  // Category volume setters (0..1), live. Music/SFX drive their AUDIO GROUP gain, which scales every
  // sound in the group — including the currently-playing BGM — with no per-sound bookkeeping. The
  // SystemMenu slider writes the Settings value itself; these just apply it. (Music ramps over 50ms
  // to avoid a click while dragging; SFX is instant since each cue is brief.)
  static setMusicGain(g) {
    audio_group_set_gain(bgm, g < 0 ? 0 : g > 1 ? 1 : g, 50);
  }

  static setSfxGain(g) {
    audio_group_set_gain(sfx, g < 0 ? 0 : g > 1 ? 1 : g, 0);
  }

  static setMasterGain(g) {
    audio_master_gain(g < 0 ? 0 : g > 1 ? 1 : g);
  }

  // Stop everything on a base scene swap: the looping BGM + any pending fade + lingering SFX.
  // One-shot SFX would finish on their own, but audio_stop_all guarantees a clean slate.
  static reset() {
    audio_stop_all();
    Audio._bgm = -1;
    Audio._bgmName = "";
    Audio._fadeStop = -1;
  }
};
