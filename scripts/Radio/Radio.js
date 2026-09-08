// The player's BGM dial over Music: a tuned station plays through every map arrival until the
// dial goes off, when the map's own bed returns. A TIMED station is the player's knob on the sim
// tempo — the scene runs the whole world at the playing track's beat (sceneColony.tempo →
// Time.tempo), so tuning Raid (120 BPM) is choosing 120 ticks a second.
/**
 * Singleton (Game/System). The dial is every SoundMeta def carrying a `name` — declared in
 * contentSounds, so a new station is one data line there. Holds only the tuned track: what plays
 * is Music's, the tempo the scene's, the bed to fall back to the injected `ambient` hook's.
 */
globalThis.Radio = {
  _sound: -1, // the tuned track asset (-1 = off: the map's bed plays)
  /**
   * Injected: () => the bed to resume when the dial goes off — sceneColony.create wires
   * ColonyMap.bed over the live level. null until wired; off() then just stops the music.
   */
  ambient: null,

  /**
   * The dial: every declared track with a name, in declaration order (SoundMeta defs).
   */
  stations() {
    const all = SoundMeta.all();
    const out = [];
    for (let i = 0; i < all.length; i++)
      if (all[i].name !== "") out.push(all[i]);
    return out;
  },

  /**
   * true while a station is tuned — its track plays through map arrivals (ColonyMap._applyBgm
   * defers to it).
   */
  on() {
    return Radio._sound !== -1;
  },

  /**
   * The tuned track asset, or -1 when off.
   */
  station() {
    return Radio._sound;
  },

  /**
   * Tune a station: its track cross-fades in (Music.play) and stays on through map arrivals.
   * Re-tuning the tuned one is a no-op; an asset that is gone is refused. Returns true if tuned.
   */
  tune(sound) {
    if (!audio_exists(sound)) return false;
    if (sound === Radio._sound) return true;
    Radio._sound = sound;
    Music.play(sound);
    Audio.play({ sound: sndRadioOpen });
    return true;
  },

  /**
   * Dial off: the map's bed resumes through the `ambient` hook (silence when none is wired).
   * A no-op when already off.
   */
  off() {
    if (Radio._sound === -1) return;
    Radio._sound = -1;
    if (Radio.ambient !== null) Music.play(Radio.ambient());
    else Music.stop();
    Audio.play({ sound: sndRadioClose });
  },

  /**
   * Forget the tuned station and the bed hook (scene create + destroy) — the track itself
   * stops with the scene (Audio.restart), so no fade runs here.
   */
  reset() {
    Radio._sound = -1;
    Radio.ambient = null;
  },
};
