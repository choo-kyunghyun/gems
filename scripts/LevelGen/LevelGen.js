/**
 * Seeded stream: () => [0,1). Walks the hash field diagonally by a per-draw counter, so each
 * (seed, salt) draws an independent sequence with no shared global-stream state.
 */
function _stream(seed) {
  let i = 0;
  return function () {
    i++;
    return hash2(i, -i, seed);
  };
}

/**
 * @typedef {Object} GenPass
 * @property {number} [salt]  per-pass stream salt — declare a unique int for order-stable streams
 * @property {function(Object): void} apply  builds into ctx.out
 */
/**
 * A PASS is `{ salt?, apply(ctx) }` (a GenPass) or a bare `function(ctx)` (wrapped on insert, like
 * Snapshot). An ordered list of passes builds ONE WHOLE LEVEL's content over a shared context; the
 * terrain base comes from a composed `field` (TerrainField-like sampler), which paint() writes into
 * the level's terrain layer.
 *
 * ctx = { gen, field, cols, rows, rng, claims, claim(x,y,w,h), free(x,y,w,h), claimed(gx,gy),
 * rects(layer, material), out } — `out` accumulates a LevelData in grid coords, so what a generator
 * produces is the same shape a level FILE holds and one painter writes both. A pass reads the field
 * and pushes into `out`: tile rects through `ctx.rects`, which merges them by (layer, material) so
 * the output stays one entry per channel however many passes drew into it; zones and spawns onto
 * `out.zones`/`out.spawns` directly. CLAIMS are the exclusion channel: an overlay pass
 * (AuthoredStamp) claims the hand-built area, a stamp claims its own footprint, and later passes
 * skip claimed cells — so nothing scatters into a building and two stamps can't overlap.
 * Suppression follows the CONTENT: a claim is a rect a pass drew, not a region of the level fixed
 * up front.
 *
 * Determinism: each pass draws from its OWN stream, seeded from (seed, pass salt) — so the same seed
 * lays out the same level on every BUILD (a SAVE keeps only entity state, so the ground and its
 * layout must come back identical), AND inserting/removing a pass never reshuffles the other passes'
 * output. Declare `salt` (any small int, unique per pass) for that stability — an undeclared salt
 * falls back to the pass INDEX, which re-couples streams to list order.
 * GMRT-safe: index loops, class on globalThis.
 */
globalThis.LevelGen = class LevelGen {
  /**
   * opts: field (required TerrainField-like sampler — materialAt/paint/solidRects), seed?, palette?
   * (material table the terrain layer is typed by; default the field's), passes? (GenPass objects
   * or bare functions).
   */
  constructor(opts = {}) {
    if (opts.field === undefined)
      throw new Error("LevelGen needs a terrain field");
    this.field = opts.field;
    this.seed = (opts.seed ?? 1337) | 0;
    // the material table the terrain layer's TileTypes + render passes are built from
    this.palette = opts.palette ?? opts.field.palette;
    this.passes = [];
    const passes = opts.passes ?? [];
    for (let i = 0; i < passes.length; i++) this.insert(passes[i]);
  }

  insert(pass, index = this.passes.length) {
    const p = typeof pass === "function" ? { apply: pass } : pass;
    this.passes.splice(index, 0, p);
    return this;
  }

  /** Takes the wrapped object `insert` stored (an element of `passes`). */
  remove(pass) {
    const i = this.passes.indexOf(pass);
    if (i >= 0) this.passes.splice(i, 1);
    return this;
  }

  /**
   * Run every pass over a cols×rows level. Returns the accumulated LevelData (grid coords) plus
   * `solid`, the impassable terrain's collide-only rects — the one channel that is NOT LevelData,
   * because it has no tile layer to remesh from and so outlives a build-mode edit.
   */
  generate(cols, rows) {
    const out = { cols: cols, rows: rows, tiles: [], zones: [], spawns: [] };
    const ctx = {
      gen: this,
      field: this.field,
      cols: cols,
      rows: rows,
      rng: null,
      claims: [], // [x1, y1, x2, y2] cell rects later passes must leave alone
      out: out,
      claim(x, y, w, h) {
        this.claims.push([x, y, x + w - 1, y + h - 1]);
      },
      /**
       * The rect array of `out`'s (layer, material) tiles entry, created on first use — every pass
       * drawing the same channel appends to ONE entry.
       */
      rects(layer, material) {
        const tiles = this.out.tiles;
        for (let i = 0; i < tiles.length; i++)
          if (tiles[i].layer === layer && tiles[i].material === material)
            return tiles[i].rects;
        const entry = { layer: layer, material: material, rects: [] };
        tiles.push(entry);
        return entry.rects;
      },
      /** true if the cell rect overlaps no claim — the placement test for a stamp */
      free(x, y, w, h) {
        const c = this.claims;
        const x2 = x + w - 1;
        const y2 = y + h - 1;
        for (let i = 0; i < c.length; i++)
          if (x <= c[i][2] && x2 >= c[i][0] && y <= c[i][3] && y2 >= c[i][1])
            return false;
        return true;
      },
      /** true if the cell sits inside a claim — the per-cell test for a scatter */
      claimed(gx, gy) {
        return !this.free(gx, gy, 1, 1);
      },
    };
    for (let i = 0; i < this.passes.length; i++) {
      const p = this.passes[i];
      // independent per-pass stream: salt folded into the seed (prime-spread so seed+salt
      // combinations don't alias adjacent level seeds)
      const salt = p.salt ?? i + 1;
      ctx.rng = _stream(this.seed + salt * 101159);
      p.apply(ctx);
    }
    out.solid = this.field.solidRects(cols, rows);
    return out;
  }

  /** Paint the terrain base into a layer — `types` is one TileType per palette entry. */
  paint(layer, types, cols, rows) {
    this.field.paint(layer, types, cols, rows);
  }
};
