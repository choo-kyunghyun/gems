/**
 * @typedef {LevelData} PrefabDef  the fragment's content, plus:
 * @property {string} id
 * @property {string[]} [tags]   scope tags for generator filtering
 * @property {number} [weight]   weighted-pick weight (default 1)
 */
/**
 * A reusable level fragment: a registered, tagged, weighted {LevelData} in origin-local coords,
 * so a prefab carries no ops of its own. Every channel is validated against the footprint at
 * registration, since out-of-footprint content would silently break a generator's seam margin.
 */
globalThis.Prefab = {
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

  _validate(p) {
    if (typeof p.id !== "string" || p.id === "")
      throw new Error(`Prefab def needs a string id`);
    LevelData.check(p, `Prefab '${p.id}'`);
  },

  get(id) {
    return Registry.get(Prefab, id);
  },

  all() {
    return Registry.all(Prefab);
  },

  /** In registration order: a weighted pick relies on it being stable. */
  byTag(tag) {
    const all = Prefab.all();
    const out = [];
    for (let i = 0; i < all.length; i++) {
      if (all[i].tags.indexOf(tag) !== -1) out.push(all[i]);
    }
    return out;
  },
};
