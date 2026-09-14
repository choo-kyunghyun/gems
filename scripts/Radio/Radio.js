// The player's BGM dial over Music: a tuned station plays through every map arrival until the
// dial goes off, when the map's own bed returns. A TIMED station is the player's knob on the sim
// tempo — the scene runs the whole world at the playing track's beat (sceneColony.tempo →
// Time.tempo), so tuning Raid (120 BPM) is choosing 120 ticks a second.
/**
 * Singleton (Game/System). The dial is every SoundMeta def carrying a `name` — declared in
 * contentSounds, so a new station is one data line there. Logic over ONE world record (World.meta
 * under KEY — { station }, the tuned track's ASSET NAME, "" = off), so the dial starts off with
 * the world and rides the save: what plays is Music's, the tempo the scene's, the bed to fall
 * back to the injected `ambient` hook's. The record holds the name, never the asset (a record is
 * plain data — Records); `station()` resolves it back through the dial, so the ref every consumer
 * compares is the declared one (SoundMeta scans refs by identity).
 */
globalThis.Radio = {
  KEY: "radio", // its World.meta key — a data key (a save holds it)

  /**
   * Injected: () => the bed to resume when the dial goes off — sceneColony.create wires
   * ColonyMap.bed over the live level. null until wired; off() then just stops the music.
   */
  ambient: null,

  /** The dial record — `{ station }`, the tuned track's asset name or "" for off. */
  state() {
    return World.record(Radio.KEY, () => ({ station: "" }));
  },

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
    return Radio.state().station !== "";
  },

  /**
   * The tuned track asset — the dial's own ref for the record's name — or -1 when off (or when
   * the named track left the dial).
   */
  station() {
    const name = Radio.state().station;
    if (name === "") return -1;
    const list = Radio.stations();
    for (let i = 0; i < list.length; i++)
      if (audio_get_name(list[i].sound) === name) return list[i].sound;
    return -1;
  },

  /**
   * Tune a station: its track cross-fades in (Music.play) and stays on through map arrivals.
   * Re-tuning the tuned one is a no-op; an asset that is gone is refused. Returns true if tuned.
   */
  tune(sound) {
    if (!audio_exists(sound)) return false;
    const w = Radio.state();
    const name = audio_get_name(sound);
    if (name === w.station) return true;
    w.station = name;
    Music.play(sound);
    Audio.play({ sound: sndRadioOpen });
    return true;
  },

  /**
   * Dial off: the map's bed resumes through the `ambient` hook (silence when none is wired).
   * A no-op when already off.
   */
  off() {
    const w = Radio.state();
    if (w.station === "") return;
    w.station = "";
    if (Radio.ambient !== null) Music.play(Radio.ambient());
    else Music.stop();
    Audio.play({ sound: sndRadioClose });
  },

  /**
   * Drop the bed hook (scene create + destroy) — the dial itself goes with the world's records
   * (World.reset), and the track stops with the scene (Audio.restart), so no fade runs here.
   */
  reset() {
    Radio.ambient = null;
  },
};
