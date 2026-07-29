// The procedural-generation FRAME — Renderer:RenderPass :: ChunkGenerator:gen pass. Content-free: a
// game composes it with a field + passes. Pass/ctx/determinism contract on the declaration below.

/**
 * seeded stream: () => [0,1). Walks the hash field diagonally by a per-draw counter, so each
 * (cx, cy, seed) draws an independent sequence with no shared global-stream state.
 * @param {number} cx
 * @param {number} cy
 * @param {number} seed
 * @returns {function(): number}
 */
function _stream(cx, cy, seed) {
  let i = 0;
  return function () {
    i++;
    return hash2(cx + i, cy - i, seed);
  };
}

/**
 * @typedef {Object} GenPass
 * @property {number} [salt]  per-pass stream salt — declare a unique int for order-stable streams
 * @property {function(Object): void} apply  builds into ctx.out
 */
/**
 * A PASS is `{ salt?, apply(ctx) }` (a GenPass) or a bare `function(ctx)` (wrapped on insert, like
 * Pipeline). An ordered list of passes builds one chunk's output over a shared context; the terrain
 * base comes from a composed `field` (TerrainField-like sampler), so the frame satisfies the full
 * generator contract ChunkManager consumes (generate + palette + materialAt/costAt/terrain/solidTerrain).
 *
 * ctx = { gen, field, cx, cy, gx0, gy0, cols, rows, rng, authored, out: { walls, spawns } } — a pass
 * reads the field and pushes ABSOLUTE-coord walls/spawns into `out`. `authored` starts false; an
 * overlay pass (AuthoredStamp) sets it to claim the chunk as hand-built, and procedural passes
 * (PrefabStamp, scatters) respect the claim by early-outing.
 *
 * Determinism: each pass draws from its OWN stream, seeded from (cx, cy, seed, pass salt) — so the
 * same seed lays out the same world on every BUILD (a SAVE keeps only the touched-chunk delta, so
 * every untouched chunk must regenerate identically, and adjacent chunks must agree at their seam),
 * AND inserting/removing a pass never reshuffles the other passes' output. Declare `salt` (any small
 * int, unique per pass) for that stability — an undeclared salt falls back to the pass INDEX, which
 * re-couples streams to list order.
 * GMRT-safe: index loops, class on globalThis.
 */
globalThis.ChunkGenerator = class ChunkGenerator {
  /**
   * opts: field (required TerrainField-like sampler — terrain/solidTerrain/materialAt/costAt), seed?,
   * chunkCols?/chunkRows?, palette? (material table TerrainStream renders by; default the field's),
   * passes? (GenPass objects or bare functions).
   * @param {Object} opts
   */
  constructor(opts = {}) {
    if (opts.field === undefined)
      throw new Error("ChunkGenerator needs a terrain field");
    this.field = opts.field;
    this.seed = (opts.seed ?? 1337) | 0;
    this.chunkCols = opts.chunkCols ?? 16;
    this.chunkRows = opts.chunkRows ?? 16;
    // the material table TerrainStream renders by + costAt prices by
    this.palette = opts.palette ?? opts.field.palette;
    /** @type {GenPass[]} */
    this.passes = [];
    const passes = opts.passes ?? [];
    for (let i = 0; i < passes.length; i++) this.insert(passes[i]);
  }

  /**
   * Insert a pass at `index` (append by default), wrapping a bare function.
   * @param {GenPass|function(Object): void} pass
   * @param {number} [index=this.passes.length]
   * @returns {ChunkGenerator} this
   */
  insert(pass, index = this.passes.length) {
    const p = typeof pass === "function" ? { apply: pass } : pass;
    this.passes.splice(index, 0, p);
    return this;
  }

  /**
   * Remove a pass (the wrapped object `insert` stored, i.e. an element of `passes`).
   * @param {GenPass} pass
   * @returns {ChunkGenerator} this
   */
  remove(pass) {
    const i = this.passes.indexOf(pass);
    if (i >= 0) this.passes.splice(i, 1);
    return this;
  }

  /**
   * deterministic { terrain, solid, walls, spawns } for one chunk — the ChunkManager contract
   * @param {number} cx
   * @param {number} cy
   * @returns {{terrain: number[], solid: number[][], walls: number[][], spawns: Object[]}}
   */
  generate(cx, cy) {
    const out = { walls: [], spawns: [] };
    const ctx = {
      gen: this,
      field: this.field,
      cx: cx,
      cy: cy,
      gx0: cx * this.chunkCols,
      gy0: cy * this.chunkRows,
      cols: this.chunkCols,
      rows: this.chunkRows,
      rng: null,
      authored: false, // set by an overlay pass to suppress procedural passes
      out: out,
    };
    for (let i = 0; i < this.passes.length; i++) {
      const p = this.passes[i];
      // independent per-pass stream: salt folded into the seed (prime-spread so seed+salt
      // combinations don't alias adjacent world seeds)
      const salt = p.salt ?? i + 1;
      ctx.rng = _stream(cx, cy, this.seed + salt * 101159);
      p.apply(ctx);
    }
    return {
      terrain: this.field.terrain(cx, cy),
      solid: this.field.solidTerrain(cx, cy),
      walls: out.walls,
      spawns: out.spawns,
    };
  }

  /**
   * thin delegates to the terrain sampler — the duck-typed surface ChunkManager consumes
   * (TerrainStream's seam apron, NavGrid weights + PathFollow speed pricing)
   * @param {number} ax
   * @param {number} ay
   * @returns {number}
   */
  materialAt(ax, ay) {
    return this.field.materialAt(ax, ay);
  }
  /**
   * @param {number} ax
   * @param {number} ay
   * @returns {number}
   */
  costAt(ax, ay) {
    return this.field.costAt(ax, ay);
  }
  /**
   * @param {number} cx
   * @param {number} cy
   * @returns {number[]}
   */
  terrain(cx, cy) {
    return this.field.terrain(cx, cy);
  }
  /**
   * @param {number} cx
   * @param {number} cy
   * @returns {number[][]}
   */
  solidTerrain(cx, cy) {
    return this.field.solidTerrain(cx, cy);
  }
};
