// Sound METADATA registry — the semantic layer GameMaker doesn't store on a GMSound (kind, tempo),
// DECLARED per sound. Def shape + storage on the SoundMeta declaration below.
/**
 * A sound asset carries its samples, length and gain and nothing else; the facts game code needs
 * live here as DECLARED data, keyed by sound. Declarations are code — contentSounds registers them
 * at boot; only a sound departing from the defaults needs an entry.
 *
 * Def shape:
 *   { sound, kind, bpm?, name? }
 *   sound  the asset (a bare identifier, so a track that is gone fails at load)
 *   kind   "music" | "cue" | ... — descriptive; consumers read specific FIELDS, never switch on
 *          kind (its value is tooling/validation).
 *   bpm    the track's tempo in beats per minute, default 0 = untimed (an ambient bed). DECLARED,
 *          never measured: the runtime exposes no PCM to detect it from, and every track is
 *          synthesized at a stated tempo (tools/audio-kit). A timed track sets the sim tempo while
 *          it plays (Time.tempo, written by sceneColony.update over Music.track).
 *   name   the track's display name, an i18n key; default "" = unlisted. A named track is a
 *          station on the player's Radio dial, in declaration order.
 *
 * Storage: PARALLEL ARRAYS scanned by === identity — a Map keyed by an asset ref crashes GMRT
 * natively (docs/GMRT.md). A handful of tracks, so the linear scan is nothing.
 */
globalThis.SoundMeta = {
  _sounds: [], // refs, parallel to _defs
  _defs: [],

  /**
   * Register defs (an array). Re-registering a sound replaces.
   */
  register(defs) {
    for (const def of defs) {
      let i = 0;
      while (i < SoundMeta._sounds.length) {
        if (SoundMeta._sounds[i] === def.sound) {
          SoundMeta._defs[i] = def;
          break;
        }
        i++;
      }
      if (i === SoundMeta._sounds.length) {
        SoundMeta._sounds.push(def.sound);
        SoundMeta._defs.push(def);
      }
    }
  },

  /**
   * Every def in declaration order — the store's own array, so read it, never reorder it.
   */
  all() {
    return SoundMeta._defs;
  },

  /**
   * Def for a sound — or undefined (an undeclared sound is legal).
   */
  of(sound) {
    let i = 0;
    while (i < SoundMeta._sounds.length) {
      if (SoundMeta._sounds[i] === sound) return SoundMeta._defs[i];
      i++;
    }
    return undefined;
  },

  /**
   * Tempo of a track — declared bpm, else 0 (untimed).
   */
  bpm(sound) {
    const def = SoundMeta.of(sound);
    if (def === undefined) return 0;
    return def.bpm > 0 ? def.bpm : 0;
  },
};
