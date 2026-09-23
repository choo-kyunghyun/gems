/**
 * The structures stage: prefabs scattered across the level at a per-area density, rejecting any
 * placement that overlaps an existing claim and claiming its own footprint so nothing lands on
 * top of it. Policy enters via two hooks:
 *   spawnFilter(s, ctx) -> keep this stamped spawn? (default: keep all)
 *   defaultLoot(s, rng) -> loot array for a spawn that authored none, or undefined to leave it.
 *     Drawn before the filter verdict, so a filtered-out spawn consumes the same rng draws and
 *     the level's remaining placements don't shift.
 * A prefab is level data, so every channel it carries reaches the level unchanged.
 */
globalThis.PrefabStamp = class PrefabStamp {
  /**
   * opts: tag (required prefab scope tag), salt? (per-pass stream salt), density? (prefabs per
   * 1000 cells), margin? (level border kept clear, in cells), tries? (placement attempts before
   * a prefab is skipped), spawnFilter?, defaultLoot?.
   */
  constructor(opts = {}) {
    if (typeof opts.tag !== "string")
      throw new Error("PrefabStamp needs a prefab scope tag");
    this.salt = opts.salt;
    this.density = opts.density ?? 1.76;
    this.margin = opts.margin ?? 1;
    this.tries = opts.tries ?? 8;
    // resolved once: prefabs must be registered before the generator is composed
    this.prefabs = Prefab.byTag(opts.tag);
    this.spawnFilter = opts.spawnFilter ?? ((s, ctx) => true);
    this.defaultLoot = opts.defaultLoot ?? ((s, rng) => undefined);
  }

  apply(ctx) {
    if (this.prefabs.length === 0) return;
    const rng = ctx.rng;
    const count = Math.round((this.density * ctx.cols * ctx.rows) / 1000);
    for (let n = 0; n < count; n++) {
      const p = this._pick(rng);
      const m = this.margin;
      const maxOx = ctx.cols - 2 * m - p.cols;
      const maxOy = ctx.rows - 2 * m - p.rows;
      if (maxOx < 0 || maxOy < 0) continue; // larger than the level interior
      // a prefab that can't find room this seed is dropped
      let ox = -1;
      let oy = -1;
      for (let t = 0; t < this.tries; t++) {
        const x = m + Math.floor(rng() * (maxOx + 1));
        const y = m + Math.floor(rng() * (maxOy + 1));
        if (ctx.free(x, y, p.cols, p.rows)) {
          ox = x;
          oy = y;
          break;
        }
      }
      if (ox < 0) continue;
      ctx.claim(ox, oy, p.cols, p.rows);

      const st = LevelData.translate(p, ox, oy);
      const kept = [];
      for (let i = 0; i < st.spawns.length; i++) {
        const s = st.spawns[i];
        // the translated spawn is a shallow copy: item arrays are cloned so stamped instances
        // never mutate the prefab def's
        if (s.loot !== undefined) s.loot = this._cloneItems(s.loot);
        if (s.items !== undefined) s.items = this._cloneItems(s.items);
        const extra = this.defaultLoot(s, rng); // before the filter verdict
        if (extra !== undefined) s.loot = extra;
        if (!this.spawnFilter(s, ctx)) continue;
        kept.push(s);
      }
      st.spawns = kept;
      ctx.merge(st);
    }
  }

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
