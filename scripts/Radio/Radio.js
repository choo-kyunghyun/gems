/**
 * The player's BGM dial; a timed station sets the sim tempo.
 *
 * The dial is every declared track carrying a `name`, so a new station is one data line. Its one
 * world record starts off with the world and rides the save. The record holds the track's asset
 * name, never the asset (a record is plain data); `station()` resolves it back to the declared
 * ref, which is compared by identity.
 */
globalThis.Radio = {
  KEY: "radio", // a data key: a save holds it

  /**
   * Injected: () => the bed to resume when the dial goes off. null until wired; off() then just
   * stops the music.
   */
  ambient: null,

  /** The dial record — `{ station }`, the tuned track's asset name or "" for off. */
  state() {
    return World.table.of(World.self, Radio.KEY, () => ({ station: "" }));
  },

  /** Every declared track with a name, in declaration order. */
  stations() {
    const all = AssetMeta.all();
    const out = [];
    for (let i = 0; i < all.length; i++)
      if (all[i].name) out.push(all[i]);
    return out;
  },

  /** True while a station is tuned — its track plays through map arrivals. */
  on() {
    return Radio.state().station !== "";
  },

  /** The tuned track's declared ref, or -1 when off or when the named track left the dial. */
  station() {
    const name = Radio.state().station;
    if (name === "") return -1;
    const list = Radio.stations();
    for (let i = 0; i < list.length; i++)
      if (audio_get_name(list[i].asset) === name) return list[i].asset;
    return -1;
  },

  /**
   * The track cross-fades in and stays on through map arrivals. Re-tuning the tuned one is a
   * no-op; an asset that is gone is refused. Returns true if tuned.
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

  /** The map's bed resumes through the `ambient` hook. A no-op when already off. */
  off() {
    const w = Radio.state();
    if (w.station === "") return;
    w.station = "";
    if (Radio.ambient !== null) Music.play(Radio.ambient());
    else Music.stop();
    Audio.play({ sound: sndRadioClose });
  },

  /**
   * Drop the bed hook. The dial itself goes with the world's records and the track with the
   * scene, so no fade runs here.
   */
  reset() {
    Radio.ambient = null;
  },
};
