// Procedural OVERWORLD generator — the swappable "how is wilderness generated" half of chunk
// streaming, split out of ChunkSource so generation isn't fixed: ChunkSource (the ChunkManager
// `source`) routes authored hub chunks to the level file and everything else to a generator
// like this one. Swap in a different generator (cave/desert/...) with the same generate(cx,cy)
// contract for a different world; tag its prefab set to match (see prefabTag).
//
// Contract (consumed by ChunkSource → ChunkManager):
//   generate(cx, cy) -> { walls: [[gx,gy,w,h]...], spawns: [descriptor...] }
//     ABSOLUTE grid coords, fully deterministic from (cx, cy, seed) — a chunk MUST regenerate
//     identically every visit (the streaming cache only persists ENTITY state, never terrain).
//
// Output = an optional stamped PREFAB (a hand-authored cluster) plus a loose random scatter of
// rocks + slimes. Determinism comes from a per-chunk xorshift32 seed (bitwise ops are int32-safe
// on GMRT — IdPool relies on the same). GMRT-safe: index loops, Object.keys (no Map/Set for-of),
// class assigned to globalThis.
globalThis.OverworldGen = class OverworldGen {
  constructor(opts = {}) {
    this.seed = (opts.seed ?? 1337) | 0;
    this.chunkCols = opts.chunkCols ?? 16;
    this.chunkRows = opts.chunkRows ?? 16;
    // Probability a chunk stamps a prefab (the rest is loose scatter only).
    this.prefabChance = opts.prefabChance ?? 0.45;
    // Prefab scope: only prefabs carrying this tag are eligible (so a cave generator draws from
    // a different set). Resolved once — prefabs are registered (RpgContent) before a source is
    // built. Empty set ⇒ prefab stamping is a no-op.
    this.prefabs = Prefab.byTag(opts.prefabTag ?? "overworld");
  }

  // Source contract: deterministic terrain + spawns for a chunk.
  generate(cx, cy) {
    const rng = this._rng(this._seedFor(cx, cy));
    const gx0 = cx * this.chunkCols;
    const gy0 = cy * this.chunkRows;
    const walls = [];
    const spawns = [];

    // A chunk may host one stamped prefab (a structured cluster: a den, a ruin, a boulder
    // field) placed inside the interior so it can't straddle a chunk seam.
    if (this.prefabs.length > 0 && rng() < this.prefabChance)
      this._stamp(rng, gx0, gy0, walls, spawns);

    this._scatter(rng, gx0, gy0, walls, spawns);
    return { walls, spawns };
  }

  // ── prefab stamping ─────────────────────────────────────────────────────────

  // Pick a prefab (weighted) and translate its local coords to absolute, placed at a random
  // interior offset (1-cell margin so its walls don't merge across a chunk seam).
  _stamp(rng, gx0, gy0, walls, spawns) {
    const p = this._pick(rng);
    if (p === undefined) return;
    const maxOx = this.chunkCols - 2 - p.cols;
    const maxOy = this.chunkRows - 2 - p.rows;
    if (maxOx < 0 || maxOy < 0) return; // larger than the chunk interior — skip
    const ox = gx0 + 1 + Math.floor(rng() * (maxOx + 1));
    const oy = gy0 + 1 + Math.floor(rng() * (maxOy + 1));

    for (let i = 0; i < p.walls.length; i++) {
      const r = p.walls[i];
      walls.push([ox + r[0], oy + r[1], r[2], r[3]]);
    }
    for (let i = 0; i < p.spawns.length; i++) {
      spawns.push(this._placeSpawn(p.spawns[i], ox, oy, rng));
    }
  }

  // Weighted pick from the eligible prefab set.
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

  // Translate one local spawn descriptor to an absolute one. Copies scalar fields and DEEP-copies
  // item arrays (loot/items) so stamped instances never share — and mutate, on pickup — the
  // registry def's arrays. A loot-less slime still drops the standard scatter loot.
  _placeSpawn(s, ox, oy, rng) {
    const out = {};
    const keys = Object.keys(s);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k === "lx" || k === "ly") continue;
      out[k] = s[k];
    }
    out.gx = ox + s.lx;
    out.gy = oy + s.ly;
    if (out.loot !== undefined) out.loot = this._cloneItems(out.loot);
    if (out.items !== undefined) out.items = this._cloneItems(out.items);
    if (out.preset === "slime" && out.loot === undefined)
      out.loot = this._loot(rng);
    return out;
  }

  _cloneItems(arr) {
    const out = [];
    for (let i = 0; i < arr.length; i++)
      out.push({ itemId: arr[i].itemId, qty: arr[i].qty });
    return out;
  }

  // ── loose scatter ───────────────────────────────────────────────────────────

  _scatter(rng, gx0, gy0, walls, spawns) {
    const cc = this.chunkCols;
    const cr = this.chunkRows;

    // Rock clusters (kinematic-solid wall rects). Kept off the chunk's 1-cell border so a
    // cluster never merges across a chunk seam or blocks a chunk entrance entirely.
    const rocks = 2 + Math.floor(rng() * 3); // 2..4
    for (let i = 0; i < rocks; i++) {
      const w = 1 + Math.floor(rng() * 2);
      const h = 1 + Math.floor(rng() * 2);
      const lx = 1 + Math.floor(rng() * (cc - 2 - w));
      const ly = 1 + Math.floor(rng() * (cr - 2 - h));
      walls.push([gx0 + lx, gy0 + ly, w, h]);
    }

    // Wandering slimes with light loot.
    const slimes = 1 + Math.floor(rng() * 3); // 1..3
    for (let i = 0; i < slimes; i++) {
      const lx = 1 + Math.floor(rng() * (cc - 2));
      const ly = 1 + Math.floor(rng() * (cr - 2));
      spawns.push({
        preset: "slime",
        gx: gx0 + lx,
        gy: gy0 + ly,
        hp: 3,
        loot: this._loot(rng),
      });
    }
  }

  _loot(rng) {
    const loot = [{ itemId: "slime_gel", qty: 1 + Math.floor(rng() * 2) }];
    const roll = rng();
    if (roll > 0.85) loot.push({ itemId: "gem", qty: 1 });
    else if (roll > 0.6)
      loot.push({ itemId: "coin", qty: 1 + Math.floor(rng() * 3) });
    return loot;
  }

  // ── deterministic PRNG (Park–Miller MINSTD LCG over PURE INTEGER FLOAT MATH; no bitwise) ──
  // GMRT miscompiles 32-bit xorshift: its shift-overflow / signed-shift chain collapses to a
  // constant (0x80000000 → 0.5) for many seeds (different seeds, identical output). Integer
  // multiply-mod keeps every intermediate exact below 2^53, sidestepping that whole class of bug.

  // Fold (cx, cy, seed) into a positive LCG seed in [1, M]. Each multiply-add-mod stays < 2^53
  // (exact in float), so distinct chunks get distinct seeds. M = 2^31-1 (the LCG modulus).
  _seedFor(cx, cy) {
    const M = 2147483647;
    let h = this.seed % M;
    h = (((h * 31 + (cx | 0) * 1900613) % M) + M) % M;
    h = (((h * 31 + (cy | 0) * 7368787) % M) + M) % M;
    return h + 1; // [1, M]
  }

  // Returns a function yielding floats in [0, 1). MINSTD: s' = s * 48271 mod (2^31-1).
  // 48271 * (M-1) ≈ 1.04e14 < 2^53, so the product is exact.
  _rng(seed) {
    const M = 2147483647;
    let s = seed % M;
    if (s <= 0) s += M - 1;
    return function () {
      s = (s * 48271) % M;
      return (s - 1) / (M - 1);
    };
  }
};
