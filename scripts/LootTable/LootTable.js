/**
 * Loot-table registry: what a body carries, rolled from weighted pools. A table's pools roll
 * independently, and each roll picks one entry by weight; an entry with no item is the share of
 * nothing. A count — a pool's `rolls`, an entry's `qty` — is a number or an inclusive `[lo, hi]`.
 *
 * Only a choice draws: a lone entry and a fixed count take none, so a table reads a caller's
 * stream in a fixed order — per pool its rolls, then per roll its pick and its qty.
 *
 * def: { id, pools: [{ rolls?, entries: [{ itemId?, qty?, weight? }] }] }
 */
globalThis.LootTable = {
  register(defs) {
    Registry.register(LootTable, defs, LootTable.make);
  },

  make(def) {
    if (!Array.isArray(def.pools))
      throw new Error(`LootTable "${def.id}": pools must be an array`);
    const pools = [];
    for (let p = 0; p < def.pools.length; p++) {
      const src = def.pools[p];
      if (!Array.isArray(src.entries) || src.entries.length === 0)
        throw new Error(`LootTable "${def.id}": a pool needs entries`);
      const entries = [];
      let total = 0;
      for (let e = 0; e < src.entries.length; e++) {
        const en = src.entries[e];
        const itemId = en.itemId ?? "";
        if (itemId !== "" && Item.get(itemId) === undefined)
          throw new Error(`LootTable "${def.id}": unknown item "${itemId}"`);
        const weight = en.weight ?? 1;
        if (!(weight > 0))
          throw new Error(`LootTable "${def.id}": weight must be positive`);
        total += weight;
        entries.push({
          itemId: itemId,
          qty: LootTable._range(def.id, en.qty ?? 1, 1),
          weight: weight,
        });
      }
      pools.push({
        rolls: LootTable._range(def.id, src.rolls ?? 1, 0),
        entries: entries,
        total: total,
      });
    }
    return { id: def.id, pools: pools };
  },

  /** A fresh list of `{ itemId, qty }` from table `id`, drawn off `rng` → [0, 1). */
  roll(id, rng) {
    const t = Registry.get(LootTable, id);
    if (t === undefined) throw new Error(`LootTable.roll: unknown table "${id}"`);
    const out = [];
    for (let p = 0; p < t.pools.length; p++) {
      const pool = t.pools[p];
      const n = LootTable._draw(pool.rolls, rng);
      for (let r = 0; r < n; r++) {
        const en = LootTable._pick(pool, rng);
        if (en.itemId === "") continue;
        out.push({ itemId: en.itemId, qty: LootTable._draw(en.qty, rng) });
      }
    }
    return out;
  },

  _pick(pool, rng) {
    const entries = pool.entries;
    if (entries.length === 1) return entries[0];
    let r = rng() * pool.total;
    for (let i = 0; i < entries.length; i++) {
      r -= entries[i].weight;
      if (r < 0) return entries[i];
    }
    return entries[entries.length - 1];
  },

  _draw(range, rng) {
    const lo = range[0];
    const hi = range[1];
    return lo === hi ? lo : lo + Math.floor(rng() * (hi - lo + 1));
  },

  /** A count as `[lo, hi]`, whole and no lower than `min`. */
  _range(id, v, min) {
    const lo = Array.isArray(v) ? v[0] : v;
    const hi = Array.isArray(v) ? v[1] : v;
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi < lo)
      throw new Error(`LootTable "${id}": bad count ${v}`);
    return [lo, hi];
  },
};
