// Sprite METADATA registry — the semantic layer GameMaker doesn't store on a GMSprite (kind, art
// density), DECLARED per sprite. Def shape + storage on the SpriteMeta declaration below.
/**
 * A sprite asset carries frames/trim/origin and nothing else; the facts game code needs live here as
 * DECLARED data, keyed by sprite. Declarations are code — contentSprites registers them at boot;
 * only a sprite departing from the defaults needs an entry.
 *
 * Def shape:
 *   { sprite, kind, density? }
 *   sprite   the asset (a bare identifier, so a sheet that is gone fails at load)
 *   kind     "entity" | "overlay" | "tileset" | "atlas" | ... — descriptive; consumers read specific
 *            FIELDS, never switch on kind (its value is tooling/validation).
 *   density  source px per world px, default 1. DECLARED, never inferred: a 32px cell can mean a
 *            denser subject OR a taller one — only the art's author knows. Divides the DRAW scale only
 *            (xscale/yscale = design scale / density); never touches the BBox. Bake sites:
 *            EntityPreset.spawn / ColonyPlayer.spawn.
 *
 * Storage: PARALLEL ARRAYS scanned by === identity — a Map keyed by a sprite ref crashes GMRT
 * natively (docs/GMRT.md). A handful of sheets, so the linear scan is nothing.
 */
globalThis.SpriteMeta = {
  _sprites: [], // refs, parallel to _defs
  _defs: [],

  /**
   * Register defs (an array). Re-registering a sprite replaces.
   */
  register(defs) {
    for (const def of defs) {
      let i = 0;
      while (i < SpriteMeta._sprites.length) {
        if (SpriteMeta._sprites[i] === def.sprite) {
          SpriteMeta._defs[i] = def;
          break;
        }
        i++;
      }
      if (i === SpriteMeta._sprites.length) {
        SpriteMeta._sprites.push(def.sprite);
        SpriteMeta._defs.push(def);
      }
    }
  },

  /**
   * Def for a sprite — or undefined (an undeclared sprite is legal).
   */
  of(sprite) {
    let i = 0;
    while (i < SpriteMeta._sprites.length) {
      if (SpriteMeta._sprites[i] === sprite) return SpriteMeta._defs[i];
      i++;
    }
    return undefined;
  },

  /**
   * Density of a sheet — declared value, else 1 (the art-native baseline).
   */
  density(sprite) {
    const def = SpriteMeta.of(sprite);
    if (def === undefined) return 1;
    return def.density > 0 ? def.density : 1;
  },

  /**
   * Final draw scale for a design scale on a sheet: scale / density.
   */
  fit(scale, sprite) {
    return scale / SpriteMeta.density(sprite);
  },
};
