// Asset METADATA registry — the semantic layer GameMaker doesn't store on an asset (kind, art
// density, tempo), DECLARED per asset. Def shape + storage on the AssetMeta declaration below.
/**
 * An asset carries what its resource holds — a sprite its frames/trim/origin, a sound its samples/
 * length/gain — and nothing else; the facts game code needs live here as DECLARED data, keyed by
 * the asset. Declarations are code — contentSprites and contentSounds register them at boot; only
 * an asset departing from the defaults needs an entry. One store for every asset type: a ref is
 * unique across types, and each field is read by the consumers of one type, so a mixed `all` is
 * filtered by the field a reader wants (Radio.stations over `name`).
 *
 * Def shape:
 *   { asset, kind, density?, bpm?, name? }
 *   asset    the asset (a bare identifier, so a resource that is gone fails at load)
 *   kind     "entity" | "overlay" | "tileset" | "music" | "cue" | ... — descriptive; consumers
 *            read specific FIELDS, never switch on kind (its value is tooling/validation).
 *   density  a sprite's source px per world px, default 1. DECLARED, never inferred: a 32px cell
 *            can mean a denser subject OR a taller one — only the art's author knows. Divides the
 *            DRAW scale only (xscale/yscale = design scale / density); never touches the BBox.
 *            Bake sites: EntityPreset.spawn / ColonyPlayer.spawn.
 *   bpm      a sound's tempo in beats per minute, default 0 = untimed (an ambient bed). DECLARED,
 *            never measured: the runtime exposes no PCM to detect it from, and every track is
 *            synthesized at a stated tempo (tools/audio-kit). A timed track sets the sim tempo
 *            while it plays (Time.tempo, written by sceneColony.update over Music.track).
 *   name     a track's display name, an i18n key; default "" = unlisted. A named track is a
 *            station on the player's Radio dial, in declaration order.
 *
 * Storage: PARALLEL ARRAYS scanned by === identity — a Map keyed by an asset ref crashes GMRT
 * natively (docs/GMRT.md), which is why this is not a `Registry` facade. A few dozen assets, so
 * the linear scan is nothing.
 */
globalThis.AssetMeta = {
  _assets: [], // refs, parallel to _defs
  _defs: [],

  /**
   * Register defs (an array). Re-registering an asset replaces its def in place.
   */
  register(defs) {
    for (const def of defs) {
      let i = 0;
      while (i < AssetMeta._assets.length) {
        if (AssetMeta._assets[i] === def.asset) {
          AssetMeta._defs[i] = def;
          break;
        }
        i++;
      }
      if (i === AssetMeta._assets.length) {
        AssetMeta._assets.push(def.asset);
        AssetMeta._defs.push(def);
      }
    }
  },

  /**
   * Every def in declaration order — the store's own array, so read it, never reorder it.
   */
  all() {
    return AssetMeta._defs;
  },

  /**
   * Def for an asset — or undefined (an undeclared asset is legal).
   */
  of(asset) {
    let i = 0;
    while (i < AssetMeta._assets.length) {
      if (AssetMeta._assets[i] === asset) return AssetMeta._defs[i];
      i++;
    }
    return undefined;
  },

  /**
   * Density of a sheet — declared value, else 1 (the art-native baseline).
   */
  density(sprite) {
    const def = AssetMeta.of(sprite);
    if (def === undefined) return 1;
    return def.density > 0 ? def.density : 1;
  },

  /**
   * Final draw scale for a design scale on a sheet: scale / density.
   */
  fit(sprite, scale) {
    return scale / AssetMeta.density(sprite);
  },

  /**
   * Tempo of a track — declared bpm, else 0 (untimed).
   */
  bpm(sound) {
    const def = AssetMeta.of(sound);
    if (def === undefined) return 0;
    return def.bpm > 0 ? def.bpm : 0;
  },
};
