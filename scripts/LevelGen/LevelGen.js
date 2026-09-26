/** Seeded stream () => [0,1): an independent sequence per seed, with no shared global state. */
function _stream(seed) {
  let i = 0;
  return function () {
    i++;
    return hash2(i, -i, seed);
  };
}

/**
 * @typedef {Object} GenPass
 * @property {number} [salt]  per-pass stream salt — a unique int keeps streams order-stable
 * @property {function(Object): void} apply
 */
/**
 * @typedef {Object} GenMaterial
 * @property {string} id                the key passes name it by
 * @property {number|null} pathCost     null → impassable, meshed into `solid`
 * @property {boolean} [spawnable]      false bans placement without blocking travel
 */
/**
 * A level generator: an ordered list of passes over one shared context, each reading what the
 * passes before it laid down. A pass is a GenPass or a bare `function(ctx)`. The passes are the
 * consumer's — this class ships none.
 *
 * The context, built per generate, carries one stage's output to the next:
 *   terrain   palette index per cell — the ground the level paints
 *   mask      the claimed cells — the exclusion channel: what a pass drew claims its cells, and
 *             later passes keep off them, so nothing scatters into a building and stamps can't
 *             overlap
 *   out       the accumulating LevelData (grid coords), one tiles entry per (layer, material)
 *             however many passes drew into it
 *   seed/rng  this pass's own folded seed and its stream
 * plus gen, cols, rows, palette and the lookups and tests below.
 *
 * Determinism: each pass draws from its own stream and noise seed, folded from (seed, salt), so the
 * same seed lays out the same level on every build — a save keeps only the painted grid — and
 * inserting or removing a pass never reshuffles the others. An undeclared salt falls back to the
 * pass index, which re-couples streams to list order.
 * BUG: typed arrays are only zero-initialised here — no rangeless `fill` (docs/GMRT.md).
 */
globalThis.LevelGen = class LevelGen {
  /**
   * opts: palette (required — the ordered GenMaterial table; its index is the terrain layer's
   * painter order), seed?, passes?.
   */
  constructor(opts = {}) {
    if (!Array.isArray(opts.palette) || opts.palette.length === 0)
      throw new Error("LevelGen needs a material palette");
    this.palette = opts.palette;
    this.seed = (opts.seed ?? 1337) | 0;
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
   * Returns the accumulated LevelData (grid coords) plus `terrain`, the palette index per cell.
   */
  generate(cols, rows) {
    const palette = this.palette;
    const out = { cols: cols, rows: rows, tiles: [], spawns: [] };
    const ctx = {
      gen: this,
      cols: cols,
      rows: rows,
      palette: palette,
      seed: 0,
      rng: null,
      terrain: new Uint8Array(cols * rows),
      mask: new Uint8Array(cols * rows),
      out: out,
      /** Unknown throws: a typo would otherwise paint palette[0]. */
      material(id) {
        for (let i = 0; i < palette.length; i++)
          if (palette[i].id === id) return i;
        throw new Error(`LevelGen: unknown material "${id}"`);
      },
      materialAt(x, y) {
        return this.terrain[y * this.cols + x];
      },
      setMaterial(x, y, m) {
        this.terrain[y * this.cols + x] = m;
      },
      passable(x, y) {
        return palette[this.terrain[y * this.cols + x]].pathCost !== null;
      },
      spawnable(x, y) {
        const e = palette[this.terrain[y * this.cols + x]];
        return e.pathCost !== null && e.spawnable !== false;
      },
      /** Clipped to the level. */
      claim(x, y, w, h) {
        const x1 = Math.max(x, 0);
        const y1 = Math.max(y, 0);
        const x2 = Math.min(x + w, this.cols);
        const y2 = Math.min(y + h, this.rows);
        for (let cy = y1; cy < y2; cy++)
          for (let cx = x1; cx < x2; cx++) this.mask[cy * this.cols + cx] = 1;
      },
      /** Inside the level and overlapping no claim. */
      free(x, y, w, h) {
        if (x < 0 || y < 0 || x + w > this.cols || y + h > this.rows)
          return false;
        for (let cy = y; cy < y + h; cy++)
          for (let cx = x; cx < x + w; cx++)
            if (this.mask[cy * this.cols + cx] === 1) return false;
        return true;
      },
      /** The placement test for a stamp. */
      open(x, y, w, h) {
        if (!this.free(x, y, w, h)) return false;
        for (let cy = y; cy < y + h; cy++)
          for (let cx = x; cx < x + w; cx++)
            if (!this.spawnable(cx, cy)) return false;
        return true;
      },
      /** The per-cell test for a scatter. */
      claimed(x, y) {
        return this.mask[y * this.cols + x] === 1;
      },
      /** The (layer, material) channel's one rect array, created on first use. */
      rects(layer, material) {
        const tiles = this.out.tiles;
        for (let i = 0; i < tiles.length; i++)
          if (tiles[i].layer === layer && tiles[i].material === material)
            return tiles[i].rects;
        const entry = { layer: layer, material: material, rects: [] };
        tiles.push(entry);
        return entry.rects;
      },
      /** Append an already-translated LevelData to `out`. */
      merge(data) {
        const tiles = data.tiles ?? [];
        for (let i = 0; i < tiles.length; i++) {
          const t = tiles[i];
          const dst = this.rects(t.layer, t.material);
          for (let j = 0; j < t.rects.length; j++) dst.push(t.rects[j]);
        }
        const spawns = data.spawns ?? [];
        for (let i = 0; i < spawns.length; i++) this.out.spawns.push(spawns[i]);
      },
    };
    for (let i = 0; i < this.passes.length; i++) {
      const p = this.passes[i];
      // prime-spread so a salted seed doesn't alias an adjacent level seed
      const salt = p.salt ?? i + 1;
      ctx.seed = this.seed + salt * 101159;
      ctx.rng = _stream(ctx.seed);
      p.apply(ctx);
    }
    out.terrain = ctx.terrain;
    return out;
  }

  /**
   * Paint a generate() result's terrain into a layer, one TileType per palette entry. After this
   * the ground is tile data, so nothing samples the generator at play time.
   */
  paint(out, layer, types) {
    const cols = out.cols;
    for (let y = 0; y < out.rows; y++)
      for (let x = 0; x < cols; x++)
        layer.set(x, y, types[out.terrain[y * cols + x]]);
  }
};
