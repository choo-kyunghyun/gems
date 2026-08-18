/**
 * Scatters prefabs across the whole level at a per-area DENSITY, rejecting any placement that
 * overlaps an existing claim (the authored hub, or an earlier stamp) and claiming its own footprint
 * so nothing lands on top of it. Policy enters via two hooks (the colony's policy lives in
 * OverworldGen.create):
 *   spawnFilter(s, field) -> keep this stamped spawn? (default: keep all)
 *   defaultLoot(s, rng)   -> loot array for a spawn that authored none, or undefined to leave it.
 *     Drawn BEFORE the spawnFilter verdict so a filtered-out spawn consumes the same rng draws — the
 *     level's remaining placements must not shift.
 * Output carries only walls + spawns, so a tiles/zones-bearing prefab warns once at construction
 * rather than silently dropping channels (apply()-based generators consume those).
 */
globalThis.PrefabStamp = class PrefabStamp {
  /**
   * opts: tag (required prefab scope tag — only Prefab.byTag(tag) is eligible), salt? (per-pass
   * stream salt, see LevelGen), density? (prefabs per 1000 cells, default 1.76), margin? (level
   * border kept clear in cells, default 1), tries? (placement attempts before a prefab is skipped,
   * default 8), spawnFilter?/defaultLoot? (the two policy hooks — see the header).
   */
  constructor(opts = {}) {
    if (typeof opts.tag !== "string")
      throw new Error("PrefabStamp needs a prefab scope tag");
    this.salt = opts.salt;
    this.density = opts.density ?? 1.76;
    this.margin = opts.margin ?? 1;
    this.tries = opts.tries ?? 8;
    // resolved once — register prefabs BEFORE composing the generator (like OverworldGen's note)
    this.prefabs = Prefab.byTag(opts.tag);
    this.spawnFilter = opts.spawnFilter ?? ((s, field) => true);
    this.defaultLoot = opts.defaultLoot ?? ((s, rng) => undefined);
    for (let i = 0; i < this.prefabs.length; i++) {
      const p = this.prefabs[i];
      if (p.tiles.length > 0 || p.zones.length > 0)
        Log.warn(
          `PrefabStamp: prefab '${p.id}' has tiles/zones — level output drops them`,
        );
    }
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
      if (maxOx < 0 || maxOy < 0) continue; // larger than the level interior — skip
      // reject-and-retry against the claims; a prefab that can't find room this seed is dropped
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
