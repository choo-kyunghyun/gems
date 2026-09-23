/**
 * Declared per-asset metadata that GameMaker does not store.
 *
 * The facts game code needs about an asset beyond what its resource holds live here as DECLARED
 * data, keyed by the asset and registered at boot; only an asset departing from the defaults
 * needs an entry. One store serves every asset type: a ref is unique across types, and a reader
 * filters `all` by the field it wants.
 *
 * Def shape:
 *   { asset, kind, density?, bpm?, name? }
 *   asset    the asset (a bare identifier, so a resource that is gone fails at load)
 *   kind     "entity" | "overlay" | "tileset" | "music" | "cue" | ... — descriptive only; readers
 *            read specific FIELDS, never switch on kind.
 *   density  a sprite's source px per world px, default 1. Declared, never inferred: a 32px cell
 *            can mean a denser subject OR a taller one — only the art's author knows. Divides the
 *            draw scale only, never the collider.
 *   bpm      a sound's tempo, default 0 = untimed. Declared, never measured: the runtime exposes
 *            no PCM to detect it from.
 *   name     a track's display name, an i18n key; default "" = unlisted.
 *
 * Storage: PARALLEL ARRAYS scanned by === identity — a Map keyed by an asset ref crashes natively
 * (docs/GMRT.md). A few dozen assets, so the linear scan is nothing.
 */
globalThis.AssetMeta = {
  _assets: [], // refs, parallel to _defs
  _defs: [],

  /** Re-registering an asset replaces its def in place. */
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

  /** Every def in declaration order — the store's own array, so read it, never reorder it. */
  all() {
    return AssetMeta._defs;
  },

  /** undefined for an undeclared asset, which is legal. */
  of(asset) {
    let i = 0;
    while (i < AssetMeta._assets.length) {
      if (AssetMeta._assets[i] === asset) return AssetMeta._defs[i];
      i++;
    }
    return undefined;
  },

  density(sprite) {
    const def = AssetMeta.of(sprite);
    if (def === undefined) return 1;
    return def.density > 0 ? def.density : 1;
  },

  /** The draw scale for a design scale on a sheet. */
  fit(sprite, scale) {
    return scale / AssetMeta.density(sprite);
  },

  bpm(sound) {
    const def = AssetMeta.of(sound);
    if (def === undefined) return 0;
    return def.bpm > 0 ? def.bpm : 0;
  },
};
