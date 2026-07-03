// Generic prefab-stamp GEN PASS for a ChunkGenerator — rolls a chance, weighted-picks a Prefab
// by scope tag, and stamps it (Prefab.stamp local→absolute) at a random interior offset (margin
// cells off the chunk border so stamped walls can't merge across a seam). Policy enters via two
// hooks (the pass itself is content-free — the RPG's policy lives in OverworldGen.create):
//   spawnFilter(s, field) -> keep this stamped spawn? (default: keep all)
//   defaultLoot(s, rng)   -> loot array for a spawn that authored none, or undefined to leave it.
//     Drawn BEFORE the spawnFilter verdict so a filtered-out spawn consumes the same rng draws —
//     the chunk's remaining placements must not shift.
// Chunk output carries only walls + spawns, so a tiles/zones-bearing prefab warns once at
// construction rather than silently dropping channels (apply()-based generators consume those).
globalThis.PrefabStamp = class PrefabStamp {
  /**
   * @param {Object} opts
   * @param {string} opts.tag        prefab scope tag (only Prefab.byTag(tag) is eligible)
   * @param {number} [opts.salt]     per-pass stream salt (see ChunkGenerator)
   * @param {number} [opts.chance]   probability a chunk stamps a prefab (default 0.45)
   * @param {number} [opts.margin]   interior border kept clear, in cells (default 1)
   * @param {function(Object, Object): boolean} [opts.spawnFilter]
   * @param {function(Object, function(): number): (Object[] | undefined)} [opts.defaultLoot]
   */
  constructor(opts = {}) {
    if (typeof opts.tag !== "string")
      throw new Error("PrefabStamp needs a prefab scope tag");
    this.salt = opts.salt;
    this.chance = opts.chance ?? 0.45;
    this.margin = opts.margin ?? 1;
    // resolved once — register prefabs BEFORE composing the generator (like OverworldGen's note)
    this.prefabs = Prefab.byTag(opts.tag);
    this.spawnFilter = opts.spawnFilter ?? ((s, field) => true);
    this.defaultLoot = opts.defaultLoot ?? ((s, rng) => undefined);
    for (let i = 0; i < this.prefabs.length; i++) {
      const p = this.prefabs[i];
      if (p.tiles.length > 0 || p.zones.length > 0)
        Log.warn(
          `PrefabStamp: prefab '${p.id}' has tiles/zones — chunk output drops them`,
        );
    }
  }

  // one optional stamped prefab per chunk (never on an authored chunk — see AuthoredStamp)
  apply(ctx) {
    if (ctx.authored === true) return;
    if (this.prefabs.length === 0) return;
    const rng = ctx.rng;
    if (rng() >= this.chance) return;
    const p = this._pick(rng);
    const m = this.margin;
    const maxOx = ctx.cols - 2 * m - p.cols;
    const maxOy = ctx.rows - 2 * m - p.rows;
    if (maxOx < 0 || maxOy < 0) return; // larger than the chunk interior — skip
    const ox = ctx.gx0 + m + Math.floor(rng() * (maxOx + 1));
    const oy = ctx.gy0 + m + Math.floor(rng() * (maxOy + 1));

    const st = p.stamp(ox, oy);
    for (let i = 0; i < st.walls.length; i++) ctx.out.walls.push(st.walls[i]);
    for (let i = 0; i < st.spawns.length; i++) {
      const s = st.spawns[i];
      // stamp's spawn copy is shallow — deep-copy item arrays so stamped instances never
      // share (and mutate on pickup) the registry def's arrays
      if (s.loot !== undefined) s.loot = this._cloneItems(s.loot);
      if (s.items !== undefined) s.items = this._cloneItems(s.items);
      const extra = this.defaultLoot(s, rng); // before the filter verdict — see header
      if (extra !== undefined) s.loot = extra;
      if (!this.spawnFilter(s, ctx.field)) continue;
      ctx.out.spawns.push(s);
    }
  }

  // weighted pick from the eligible prefab set
  _pick(rng) {
    const all = this.prefabs;
    let total = 0;
    for (let i = 0; i < all.length; i++) total += all[i].weight;
    let r = rng() * total;
    for (let i = 0; i < all.length; i++) {
      r -= all[i].weight;
      if (r < 0) return all[i];
    }
    return all[all.length - 1];
  }

  _cloneItems(arr) {
    const out = [];
    for (let i = 0; i < arr.length; i++)
      out.push({ itemId: arr[i].itemId, qty: arr[i].qty });
    return out;
  }
};
