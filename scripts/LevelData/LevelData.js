/**
 * @typedef {Object} LevelTiles
 * @property {string} layer       tile-layer KEY, resolved through paint()'s `opts.layers` bag
 * @property {string} [material]  material key on a materials-bearing layer (default: the layer's own)
 * @property {number[][]} rects   [[x,y,w,h]...] cell rects in the data's LOCAL coords
 */
/**
 * @typedef {Object} LevelZones
 * @property {string} channel     ZoneMap channel key on the level grid
 * @property {string} [name]
 * @property {string[]} [tags]
 * @property {Object} [data]      JSON payload (Zone.data; nested OK, no Set)
 * @property {number[][]} rects   [[x,y,w,h]...] cell rects in the data's LOCAL coords
 */
/**
 * @typedef {Object} LevelData
 * @property {number} cols        footprint width in cells
 * @property {number} rows        footprint height in cells
 * @property {number} [cell]      cell size in px — whole levels only (a fragment inherits its host's)
 * @property {LevelTiles[]} [tiles]
 * @property {LevelZones[]} [zones]
 * @property {Object[]} [spawns]  entity descriptors at gx/gy; the shape is consumer-defined and Core
 *                                never reads past those two keys
 * @property {Object} [meta]      whole levels only — spawn entries, climate, settlement, seed
 */
/**
 * @typedef {Object} LevelPaintOpts
 * @property {LevelGrid} grid                the level grid (tile layers / zone channels)
 * @property {Object<string, *>} layers      handles bag keyed `<key>Layer` / `<key>Type` /
 *                                           `<key>Types` (ColonyLevel._makeLayers builds it)
 * @property {number} [ox]                   cell offset of the data's ORIGIN (default 0)
 * @property {number} [oy]
 */
/**
 * THE ONE SHAPE authored map content takes: a cols×rows footprint plus three optional channels —
 * `tiles` into named tile layers, `zones` into named ZoneMap channels, `spawns` as opaque entity
 * descriptors. Every coordinate is LOCAL to the data's own origin, which is what makes the shape
 * scale-free: a whole level file is a LevelData whose origin is (0,0), a Prefab one whose origin is
 * wherever it gets stamped. There is no separate fragment type.
 *
 * Two ops, and between them every consumer: translate() moves data to another coordinate space
 * (data → data, for a generator accumulating content it paints later), paint() writes the two
 * Core-expressible channels into a level grid (data → level). Spawns are never spawned — paint
 * returns them translated and the caller feeds its own descriptor adapter (ColonySpawn.spawnEntity),
 * since only the consumer knows the descriptor shape.
 *
 * Both ops copy spawn records SHALLOWLY: a record's nested arrays are still SHARED with the source,
 * so a consumer deep-copies what it mutates (PrefabStamp clones loot/items). Tiles/zones entries
 * likewise share the source's `type`/`data` and carry fresh translated `rects`.
 */
globalThis.LevelData = {
  /**
   * Move every channel to a coordinate space offset by (ox, oy). Returns a fresh LevelData; the
   * source is untouched. `cell`/`meta` are level-scope, not content, so they are not carried.
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
    const srcZones = data.zones ?? [];
    const zones = [];
    for (let i = 0; i < srcZones.length; i++) {
      const z = srcZones[i];
      zones.push({
        channel: z.channel,
        name: z.name,
        tags: z.tags,
        data: z.data,
        rects: LevelData._shiftRects(z.rects, ox, oy),
      });
    }
    return {
      cols: data.cols,
      rows: data.rows,
      tiles: tiles,
      zones: zones,
      spawns: LevelData._shiftSpawns(data.spawns ?? [], ox, oy),
    };
  },

  /**
   * Write the Core-expressible channels into a level at cell offset (opts.ox, opts.oy):
   *   tiles → TileEdit.set into the named layer's TileType (the caller remeshes a SOLID layer's
   *           colliders ONCE after all its writes — TileEdit's contract)
   *   zones → one Zone defined + painted per entry, channel created on demand
   * Returns `{ spawns, zones }` — spawns translated but NOT spawned (see the header), zones the
   * Zone objects just defined, in entry order.
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
          for (let x = x0; x < x0 + r[2]; x++) TileEdit.set(layer, x, y, type);
      }
    }

    const srcZones = data.zones ?? [];
    const zones = [];
    for (let i = 0; i < srcZones.length; i++) {
      const z = srcZones[i];
      const map =
        opts.grid.zoneMap(z.channel) ?? opts.grid.addZoneMap(z.channel);
      const zone = map.define({ name: z.name, tags: z.tags, data: z.data });
      for (let j = 0; j < z.rects.length; j++) {
        const r = z.rects[j];
        // paintRect takes INCLUSIVE corner cells, rects carry w/h
        map.paintRect(
          zone.id,
          ox + r[0],
          oy + r[1],
          ox + r[0] + r[2] - 1,
          oy + r[1] + r[3] - 1,
        );
      }
      zones.push(zone);
    }

    return {
      spawns: LevelData._shiftSpawns(data.spawns ?? [], ox, oy),
      zones: zones,
    };
  },

  /**
   * A tiles entry's TileType out of the handles bag: `material` picks from the layer's `<key>Types`
   * table, its absence takes the layer's default `<key>Type`. Fails loud — a typo'd material would
   * otherwise paint the default and read as a palette bug much later.
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

  /** Shallow record copies with gx/gy shifted — nested arrays stay shared (see the header). */
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
