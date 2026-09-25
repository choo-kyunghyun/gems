/**
 * @typedef {Object} LevelTiles
 * @property {string} layer       tile-layer key, resolved through paint()'s `opts.layers` bag
 * @property {string} [material]  material key on a materials-bearing layer
 * @property {number[][]} rects   [[x,y,w,h]...] cell rects in the data's local coords
 */
/**
 * @typedef {Object} LevelData
 * @property {number} cols        cells
 * @property {number} rows        cells
 * @property {number} [cell]      cell size in px — whole levels only (a fragment inherits its host's)
 * @property {LevelTiles[]} [tiles]
 * @property {Object[]} [spawns]  entity descriptors at gx/gy; the shape is consumer-defined and Core
 *                                never reads past those two keys
 * @property {Object} [meta]      whole levels only
 */
/**
 * @typedef {Object} LevelPaintOpts
 * @property {Object<string, *>} layers      handles bag keyed `<key>Layer` / `<key>Type` /
 *                                           `<key>Types`
 * @property {number} [ox]                   cell offset of the data's origin
 * @property {number} [oy]
 */
/**
 * The one shape authored map content takes: a cols×rows footprint plus two optional channels —
 * `tiles` into named tile layers, `spawns` as opaque entity descriptors. Every coordinate is local
 * to the data's own origin, so the shape is scale-free: a whole level and a stamped fragment are
 * the same type.
 *
 * translate() moves data to another coordinate space; paint() writes the tiles into a level's
 * layers. Spawns are never spawned here — only the consumer knows the descriptor shape, so paint
 * returns them translated.
 *
 * Both ops copy spawn records shallowly: nested arrays stay shared with the source, so a consumer
 * deep-copies what it mutates.
 */
globalThis.LevelData = {
  /**
   * A fresh LevelData offset by (ox, oy); the source is untouched. `cell`/`meta` are level-scope,
   * not content, so they are not carried.
   */
  translate(data, ox, oy) {
    const srcTiles = data.tiles ?? [];
    const tiles = [];
    for (let i = 0; i < srcTiles.length; i++) {
      const t = srcTiles[i];
      tiles.push({
        layer: t.layer,
        material: t.material,
        rects: LevelData._shiftRects(t.rects, ox, oy),
      });
    }
    return {
      cols: data.cols,
      rows: data.rows,
      tiles: tiles,
      spawns: LevelData._shiftSpawns(data.spawns ?? [], ox, oy),
    };
  },

  /**
   * Write the tiles into a level at the cell offset; the caller remeshes a solid layer's colliders
   * once after all its writes. Returns `{ spawns }`, translated but not spawned.
   */
  paint(data, opts) {
    const ox = opts.ox ?? 0;
    const oy = opts.oy ?? 0;
    const layers = opts.layers ?? {};

    const tiles = data.tiles ?? [];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const layer = layers[t.layer + "Layer"];
      if (layer === undefined)
        throw new Error(`LevelData: no '${t.layer}' layer passed to paint()`);
      const type = LevelData._type(layers, t);
      for (let j = 0; j < t.rects.length; j++) {
        const r = t.rects[j];
        const x0 = ox + r[0];
        const y0 = oy + r[1];
        for (let y = y0; y < y0 + r[3]; y++)
          for (let x = x0; x < x0 + r[2]; x++) layer.set(x, y, type);
      }
    }

    return {
      spawns: LevelData._shiftSpawns(data.spawns ?? [], ox, oy),
    };
  },

  /**
   * A tiles entry's TileType out of the handles bag. Fails loud — a typo'd material would otherwise
   * paint the default and read as a palette bug much later.
   */
  _type(layers, t) {
    if (t.material === undefined) return layers[t.layer + "Type"];
    const types = layers[t.layer + "Types"];
    if (types === undefined)
      throw new Error(
        `LevelData: layer '${t.layer}' carries no materials (asked for '${t.material}')`,
      );
    const type = types[t.material];
    if (type === undefined)
      throw new Error(
        `LevelData: layer '${t.layer}' has no material '${t.material}'`,
      );
    return type;
  },

  _shiftRects(rects, ox, oy) {
    const out = [];
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      out.push([ox + r[0], oy + r[1], r[2], r[3]]);
    }
    return out;
  },

  /** Shallow record copies — nested arrays stay shared. */
  _shiftSpawns(spawns, ox, oy) {
    const out = [];
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      const rec = {};
      const keys = Object.keys(s);
      for (let k = 0; k < keys.length; k++) rec[keys[k]] = s[keys[k]];
      rec.gx = ox + s.gx;
      rec.gy = oy + s.gy;
      out.push(rec);
    }
    return out;
  },
};
