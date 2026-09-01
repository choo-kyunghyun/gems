// Sprite METADATA registry — the semantic layer GameMaker doesn't store on a GMSprite (kind, art
// density), DECLARED per sprite. Def shape + storage on the SpriteMeta declaration below.
/**
 * A sprite asset carries frames/trim/origin and nothing else; the facts game code needs live here as
 * DECLARED data, keyed by sprite. Declarations are authored by the tool that GENERATED the art (the
 * pixel-art-kit importers emit datafiles/spritemeta/*.json manifests), so they cannot drift from the
 * sheets; hand-authored sprites get hand entries.
 *
 * Def shape (JSON-manifest-safe):
 *   { sprite: "<name>", kind, density?, variants? }
 *   kind     "entity" | "overlay" | "tileset" | "atlas" | ... — descriptive; consumers read specific
 *            FIELDS, never switch on kind (its value is tooling/validation).
 *   density  source px per world px, default 1. DECLARED, never inferred: a 32px cell can mean a
 *            denser subject OR a taller one — only the art's author knows. Divides the DRAW scale only
 *            (xscale/yscale = design scale / density); never touches the BBox. Bake sites:
 *            EntityPreset.spawn / ColonyPlayer.spawn.
 *   variants { "<mask>": [[frame, weight], ...] } — an autotile sheet's weighted alternate frames for
 *            one neighbor mask, so a large field of one terrain doesn't tile visibly. Only the
 *            dual-grid full-cell mask "15" is emitted today, and only RenderTileMap's dual path picks
 *            from it (position-hashed, so a rebuilt layer re-picks the same frame); an undeclared
 *            sheet falls back to uniform weights past frame 15.
 *
 * Storage: defs are authored by sprite NAME (string-keyed Map — safe), resolved to asset refs at
 * registration; the draw-time ref lookup is PARALLEL ARRAYS via === identity — a Map keyed by a sprite
 * ref crashes GMRT 0.20 natively at .get ("Bad optional access"). A handful of sheets, so the linear
 * scan is nothing.
 */
globalThis.SpriteMeta = {
  _byName: new Map(), // sprite name -> def
  _sprites: [], // resolved refs, parallel to _defs
  _defs: [],

  /**
   * Register defs (an array — from a manifest or code). Re-registering a name replaces.
   */
  register(defs) {
    for (const def of defs) {
      const ref = asset_get_index(def.sprite);
      if (!sprite_exists(ref)) {
        Log.warn(`SpriteMeta: unknown sprite "${def.sprite}" (entry skipped)`);
        continue;
      }
      SpriteMeta._byName.set(def.sprite, def);
      let i = 0;
      while (i < SpriteMeta._sprites.length) {
        if (SpriteMeta._sprites[i] === ref) {
          SpriteMeta._defs[i] = def;
          break;
        }
        i++;
      }
      if (i === SpriteMeta._sprites.length) {
        SpriteMeta._sprites.push(ref);
        SpriteMeta._defs.push(def);
      }
    }
  },

  /** Load every generated manifest (spritemeta/*.json included files). Boot-time, once. */
  load() {
    const files = File.find("spritemeta/*.json");
    let n = 0;
    for (const fname of files) {
      const text = File.read("spritemeta/" + fname);
      if (text === undefined) {
        Log.warn(`SpriteMeta: unreadable manifest ${fname}`);
        continue;
      }
      const defs = JSON.parse(text);
      SpriteMeta.register(defs);
      n += defs.length;
    }
    Log.info(`SpriteMeta: ${n} defs from ${files.length} manifest(s)`);
  },

  /**
   * Def for a sprite ref or name — or undefined (an undeclared sprite is legal).
   */
  of(sprite) {
    if (typeof sprite === "string") return SpriteMeta._byName.get(sprite);
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
