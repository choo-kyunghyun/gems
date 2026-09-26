/**
 * @typedef {Object} LevelTiles
 * @property {string} layer       tile-layer key, resolved through paint()'s `opts.layers` bag
 * @property {string} [material]  material key on a materials-bearing layer
 * @property {number[]} cells     flat [x0, y0, x1, y1, ...] cells in the data's local coords
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
 * check() holds every channel inside the footprint; translate() moves data to another coordinate
 * space; paint() writes the tiles into a level's layers. Spawns are never spawned here — only the
 * consumer knows the descriptor shape, so paint returns them translated.
 *
 * Both ops return spawn records as deep copies, so a consumer mutates its own without reaching
 * the source.
 */
globalThis.LevelData = {
  /**
   * Throws on content outside the footprint, which would otherwise land on a neighbour's cells.
   * `name` prefixes the message.
   */
  check(data, name = "LevelData") {
    if (!(data.cols >= 1) || !(data.rows >= 1))
      throw new Error(`${name}: cols/rows footprint required`);
    const tiles = data.tiles ?? [];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (typeof t.layer !== "string")
        throw new Error(`${name}: tiles[${i}] needs a layer name`);
      const c = t.cells;
      if (c.length % 2 !== 0)
        throw new Error(`${name}: tiles[${i}] cells are not x/y pairs`);
      for (let j = 0; j < c.length; j += 2) {
        const x = c[j];
        const y = c[j + 1];
        if (!(x >= 0) || !(y >= 0) || x >= data.cols || y >= data.rows)
          throw new Error(
            `${name}: tiles cell (${x},${y}) outside ${data.cols}x${data.rows}`,
          );
      }
    }
    const spawns = data.spawns ?? [];
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      if (
        !(s.gx >= 0) ||
        !(s.gy >= 0) ||
        s.gx >= data.cols ||
        s.gy >= data.rows
      )
        throw new Error(
          `${name}: spawn ${i} (${s.gx},${s.gy}) outside ${data.cols}x${data.rows}`,
        );
    }
  },

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
        cells: LevelData._shiftCells(t.cells, ox, oy),
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
   * Write the tiles into a level at the cell offset. Returns `{ spawns }`, translated but not
   * spawned.
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
      const c = t.cells;
      for (let j = 0; j < c.length; j += 2)
        layer.set(ox + c[j], oy + c[j + 1], type);
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

  _shiftCells(cells, ox, oy) {
    const out = [];
    for (let i = 0; i < cells.length; i += 2)
      out.push(ox + cells[i], oy + cells[i + 1]);
    return out;
  },

  _shiftSpawns(spawns, ox, oy) {
    const out = [];
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      const rec = Plain.copy(s);
      rec.gx = ox + s.gx;
      rec.gy = oy + s.gy;
      out.push(rec);
    }
    return out;
  },
};
