// Deterministic hashing + PRNG over Park–Miller MINSTD integer-float math — the ONE home for the
// idiom (formerly hand-mirrored in OverworldGen / TerrainStream / RenderCloudShadow). NOT xorshift32:
// GMRT miscompiles its shift chain to a constant (see CLAUDE.md GMRT-Safe Idioms → PRNG); every
// product here stays < 2^53, so plain number math is exact.
//
// Two families:
//   position hashes — pure functions of (x, y, seed): int2 / hash2 / seed2 / noise2. Same inputs →
//     same output forever, no global state — the substrate for anything that must regenerate
//     identically (chunk terrain, tile variants, per-cell decorations).
//   streams — lcg(seed) → () => [0,1) closure, or step/norm for callers keeping the state inline
//     (per-frame hot loops that reseed per cell without allocating).
//
// The GML random_* built-ins are NOT a substitute here: one global stream, and random_get_seed()
// doesn't track the stream position — it returns the last seed SET (documented GameMaker
// behaviour, both runtimes), so save/seed/restore can't be emulated.
globalThis.Rand = {
  // fold (x, y) into a seeded int in [0, M) — the shared mixing core of the hashes below.
  // The multipliers keep x/y contributions decorrelated; double-mod (+M) absorbs negative inputs.
  fold2(x, y, seed) {
    const M = 2147483647;
    let h = seed % M;
    h = (((h * 31 + (x | 0) * 1900613) % M) + M) % M;
    h = (((h * 31 + (y | 0) * 7368787) % M) + M) % M;
    return h;
  },

  // position hash → int in [0, M) (the extra MINSTD step decorrelates fold2's lattice structure)
  int2(x, y, seed) {
    return (Rand.fold2(x, y, seed) * 48271) % 2147483647;
  },

  // position hash → float in [0, 1)
  hash2(x, y, seed) {
    return Rand.int2(x, y, seed) / 2147483647;
  },

  // position → LCG seed in [1, M] (no final multiply — lcg/step's first draw does it anyway)
  seed2(x, y, seed) {
    return Rand.fold2(x, y, seed) + 1;
  },

  // one MINSTD stream step: state int in [1, M) → next state
  step(s) {
    return (s * 48271) % 2147483647;
  },

  // stream state → float in [0, 1)
  norm(s) {
    return (s - 1) / 2147483646;
  },

  // seeded stream: () => float in [0, 1). Allocates a closure — for per-cell reseeding in a hot
  // loop, keep the state in a field and use step/norm instead (see RenderCloudShadow).
  lcg(seed) {
    const M = 2147483647;
    let s = seed % M;
    if (s <= 0) s += M - 1;
    return function () {
      s = (s * 48271) % M;
      return (s - 1) / (M - 1);
    };
  },

  // value noise in [0, 1): smoothstep-interpolated over a coarse hashed lattice; pure in
  // (x, y, seed, lattice). Fold a salt into `seed` to draw an independent channel.
  noise2(x, y, seed, lattice) {
    const fx = x / lattice;
    const fy = y / lattice;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    let tx = fx - ix;
    let ty = fy - iy;
    tx = tx * tx * (3 - 2 * tx); // smoothstep for blobby, non-grid-aligned regions
    ty = ty * ty * (3 - 2 * ty);
    const v00 = Rand.hash2(ix, iy, seed);
    const v10 = Rand.hash2(ix + 1, iy, seed);
    const v01 = Rand.hash2(ix, iy + 1, seed);
    const v11 = Rand.hash2(ix + 1, iy + 1, seed);
    const a = v00 + (v10 - v00) * tx;
    const b = v01 + (v11 - v01) * tx;
    return a + (b - a) * ty;
  },
};
