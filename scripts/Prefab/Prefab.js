/**
 * @typedef {Object} PrefabDef
 * @property {string} id
 * @property {string[]} [tags]   scope tags for generator filtering
 * @property {number} [weight]   weighted-pick weight (default 1)
 * @property {number} cols       footprint width in cells
 * @property {number} rows       footprint height in cells
 * @property {LevelTiles[]} [tiles]
 * @property {Object[]} [spawns]
 */
/**
 * A REUSABLE LEVEL FRAGMENT: a registered, tagged, weighted LevelData — the def body IS a LevelData
 * (footprint + tiles/spawns in origin-local coords), so a prefab carries no ops of its own.
 * `LevelData.translate(prefab, ox, oy)` stamps it into a generator's output and `LevelData.paint`
 * writes it into a level, the same two calls a generator's whole output goes through.
 *
 * `make` fail-fast validates every channel against the footprint — an out-of-footprint rect
 * would silently break a generator's seam-margin guarantee. The def store is a `Registry` facade.
 */
globalThis.Prefab = {
  /** Validated — throws on out-of-footprint content. */
  register(defs) {
    Registry.register(Prefab, defs, Prefab.make);
  },

  make(def) {
    const p = {
      id: def.id,
      tags: def.tags ?? [],
      weight: def.weight ?? 1,
      cols: def.cols,
      rows: def.rows,
      tiles: def.tiles ?? [],
      spawns: def.spawns ?? [],
    };
    Prefab._validate(p);
    return p;
  },

  // fail fast at register time — an overflowing rect/spawn would silently break the seam
  // margin a generator's interior placement guarantees
  _validate(p) {
    if (typeof p.id !== "string" || p.id === "")
      throw new Error(`Prefab def needs a string id`);
    if (!(p.cols >= 1) || !(p.rows >= 1))
      throw new Error(`Prefab '${p.id}': cols/rows footprint required`);
    for (let i = 0; i < p.tiles.length; i++) {
      const t = p.tiles[i];
      if (typeof t.layer !== "string")
        throw new Error(`Prefab '${p.id}': tiles[${i}] needs a layer name`);
      for (let j = 0; j < t.rects.length; j++)
        Prefab._checkRect(p, "tiles", t.rects[j]);
    }
    for (let i = 0; i < p.spawns.length; i++) {
      const s = p.spawns[i];
      if (!(s.gx >= 0) || !(s.gy >= 0) || s.gx >= p.cols || s.gy >= p.rows)
        throw new Error(
          `Prefab '${p.id}': spawn ${i} (${s.gx},${s.gy}) outside ${p.cols}x${p.rows}`,
        );
    }
  },

  _checkRect(p, channel, r) {
    const ok =
      r[0] >= 0 &&
      r[1] >= 0 &&
      r[2] >= 1 &&
      r[3] >= 1 &&
      r[0] + r[2] <= p.cols &&
      r[1] + r[3] <= p.rows;
    if (!ok)
      throw new Error(
        `Prefab '${p.id}': ${channel} rect (${r[0]},${r[1]},${r[2]},${r[3]}) outside ${p.cols}x${p.rows}`,
      );
  },

  get(id) {
    return Registry.get(Prefab, id);
  },

  all() {
    return Registry.all(Prefab);
  },

  /** In registration order — a weighted pick over the set relies on it being stable. */
  byTag(tag) {
    const all = Prefab.all();
    const out = [];
    for (let i = 0; i < all.length; i++) {
      if (all[i].tags.indexOf(tag) !== -1) out.push(all[i]);
    }
    return out;
  },
};
