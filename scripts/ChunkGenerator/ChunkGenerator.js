// The procedural-generation FRAME — Renderer:RenderPass :: ChunkGenerator:gen pass. An ordered
// list of passes builds one chunk's output over a shared context; the terrain base comes from a
// composed `field` (TerrainField-like sampler), so the frame satisfies the full generator contract
// ChunkSource routes (generate + palette + materialAt/costAt/terrain/solidTerrain). Content-free:
// a game composes it with its field + passes (the RPG's composition is `OverworldGen.create`).
//
// A PASS is `{ salt?, apply(ctx) }` or a bare `function(ctx)` (wrapped on insert, like Pipeline).
// ctx = { gen, field, cx, cy, gx0, gy0, cols, rows, rng, out: { walls, spawns } } — a pass reads
// the field and pushes ABSOLUTE-coord walls/spawns into `out`.
//
// Determinism: each pass draws from its OWN stream, seeded from (cx, cy, seed, pass salt) — so
// the same seed lays out the same world on every BUILD (visits are served from the manager's
// pregenerated store — ChunkManager.pregenerate — but a cold rebuild after map eviction re-runs
// generation and must reproduce it), AND inserting/removing a pass never reshuffles the other
// passes' output (streams are independent, unlike one shared per-chunk stream). Declare `salt`
// (any small int, unique per pass) for that stability — an undeclared salt falls back to the
// pass INDEX, which re-couples streams to list order.
//
// GMRT-safe: index loops, class on globalThis.
/**
 * @typedef {Object} GenPass
 * @property {number} [salt]  per-pass stream salt — declare a unique int for order-stable streams
 * @property {function(Object): void} apply  builds into ctx.out
 */
globalThis.ChunkGenerator = class ChunkGenerator {
  /**
   * @param {Object} opts
   * @param {Object} opts.field   TerrainField-like sampler (terrain/solidTerrain/materialAt/costAt)
   * @param {number} [opts.seed]
   * @param {number} [opts.chunkCols] @param {number} [opts.chunkRows]
   * @param {Array} [opts.palette]  material table for TerrainStream (default: the field's)
   * @param {(GenPass | function(Object): void)[]} [opts.passes]
   */
  constructor(opts = {}) {
    if (opts.field === undefined)
      throw new Error("ChunkGenerator needs a terrain field");
    this.field = opts.field;
    this.seed = (opts.seed ?? 1337) | 0;
    this.chunkCols = opts.chunkCols ?? 16;
    this.chunkRows = opts.chunkRows ?? 16;
    // the material table ChunkSource.palette() exposes to TerrainStream
    this.palette = opts.palette ?? opts.field.palette;
    /** @type {GenPass[]} */
    this.passes = [];
    const passes = opts.passes ?? [];
    for (let i = 0; i < passes.length; i++) this.insert(passes[i]);
  }

  /** Insert a pass at `index` (append by default), wrapping a bare function. @returns {ChunkGenerator} this */
  insert(pass, index = this.passes.length) {
    const p = typeof pass === "function" ? { apply: pass } : pass;
    this.passes.splice(index, 0, p);
    return this;
  }

  /** Remove a pass (the wrapped object `insert` stored, i.e. an element of `passes`). @returns {ChunkGenerator} this */
  remove(pass) {
    const i = this.passes.indexOf(pass);
    if (i >= 0) this.passes.splice(i, 1);
    return this;
  }

  // deterministic { terrain, solid, walls, spawns } for one chunk — the ChunkSource contract
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
      out: out,
    };
    for (let i = 0; i < this.passes.length; i++) {
      const p = this.passes[i];
      // independent per-pass stream: salt folded into the seed (prime-spread so seed+salt
      // combinations don't alias adjacent world seeds)
      const salt = p.salt ?? i + 1;
      ctx.rng = Rand.lcg(Rand.seed2(cx, cy, this.seed + salt * 101159));
      p.apply(ctx);
    }
    return {
      terrain: this.field.terrain(cx, cy),
      solid: this.field.solidTerrain(cx, cy),
      walls: out.walls,
      spawns: out.spawns,
    };
  }

  // thin delegates to the terrain sampler — the duck-typed surface ChunkSource routes
  // (TerrainStream's seam apron, NavGrid weights + PathFollow speed pricing)
  materialAt(ax, ay) {
    return this.field.materialAt(ax, ay);
  }
  costAt(ax, ay) {
    return this.field.costAt(ax, ay);
  }
  terrain(cx, cy) {
    return this.field.terrain(cx, cy);
  }
  solidTerrain(cx, cy) {
    return this.field.solidTerrain(cx, cy);
  }
};
