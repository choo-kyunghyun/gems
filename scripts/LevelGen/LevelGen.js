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
 * @property {function(Object): void} apply  builds into the shared context (below)
 */
/**
 * @typedef {Object} GenMaterial
 * @property {string} id                the key passes name it by (`ctx.material(id)` → index)
 * @property {number|null} pathCost     TileType convention: null → impassable, meshed into `solid`
 * @property {boolean} [spawnable]      false bans placement without blocking travel (wadeable water)
 */
/**
 * A level generator shaped like a scene's Renderer: an ORDERED LIST OF PASSES over one shared
 * context, each stage reading what the stages before it laid down — ground, then the lakes carved
 * into it, then the fixed structure, walls, stamped structures, and last the entities strewn over
 * whatever is still open. A PASS is `{ salt?, apply(ctx) }` (a GenPass) or a bare `function(ctx)`
 * (wrapped on insert, like Snapshot); the stock stages are Gen* (GenGround/GenLakes/GenAnchor/
 * GenWalls/GenScatter) and PrefabStamp, and a consumer composes the list its level kind needs.
 *
 * The context (built per generate) is what makes a stage's output the next stage's input:
 *   terrain   Uint8Array of PALETTE indices, one per cell — the ground the level paints; written
 *             by the ground/lakes stages through setMaterial, read back by every later stage
 *             through materialAt / passable / spawnable
 *   mask      the claimed cells (Uint8Array) — the exclusion channel: a stamp claims its footprint,
 *             a wall its cell, and later passes keep off (free/open/claimed), so nothing scatters
 *             into a building and two stamps can't overlap. Suppression follows the CONTENT — a
 *             claim is what a pass drew, not a region fixed up front
 *   out       the accumulating LevelData (grid coords) — tile rects through `rects(layer,
 *             material)`, which merges by channel so the output stays one entry per (layer,
 *             material) however many passes drew into it; a whole translated LevelData through
 *             `merge`; zones/spawns also directly onto out.zones/out.spawns
 *   seed/rng  this pass's own folded seed and its stream (below)
 * plus gen, cols, rows, palette and material(id) (the id → index lookup; unknown throws).
 *
 * Determinism: each pass draws from its OWN stream and noise seed, folded from (seed, pass salt) —
 * so the same seed lays out the same level on every BUILD (a SAVE keeps only the painted grid and
 * the entity state, so the ground and its layout must come back identical), AND inserting/removing
 * a pass never reshuffles the other passes' output. Declare `salt` (any small int, unique per pass)
 * for that stability — an undeclared salt falls back to the pass INDEX, which re-couples streams to
 * list order.
 * GMRT-safe: index loops, class on globalThis; typed arrays are only ever zero-initialised here
 * (a rangeless `fill` is a no-op — docs/GMRT.md).
 */
globalThis.LevelGen = class LevelGen {
  /**
   * opts: palette (required — the ordered GenMaterial table; index = material id = the terrain
   * layer's painter order), seed?, passes? (GenPass objects or bare functions).
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
   * Run every pass over a cols×rows level. Returns the accumulated LevelData (grid coords) plus
   * `terrain`, the palette index per cell (what paint() writes), and `solid`, the impassable
   * terrain's collide-only rects — the one channel that is NOT LevelData, because it has no tile
   * layer to remesh from and so outlives a build-mode edit.
   */
  generate(cols, rows) {
    const palette = this.palette;
    const out = { cols: cols, rows: rows, tiles: [], zones: [], spawns: [] };
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
      /** palette index of a material id; unknown throws (a typo'd band would paint palette[0]) */
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
      /** walkable (pathCost !== null) */
      passable(x, y) {
        return palette[this.terrain[y * this.cols + x]].pathCost !== null;
      },
      /** placeable: walkable and not flagged spawnable:false */
      spawnable(x, y) {
        const e = palette[this.terrain[y * this.cols + x]];
        return e.pathCost !== null && e.spawnable !== false;
      },
      /** mark a cell rect claimed (clipped to the level) */
      claim(x, y, w, h) {
        const x1 = Math.max(x, 0);
        const y1 = Math.max(y, 0);
        const x2 = Math.min(x + w, this.cols);
        const y2 = Math.min(y + h, this.rows);
        for (let cy = y1; cy < y2; cy++)
          for (let cx = x1; cx < x2; cx++) this.mask[cy * this.cols + cx] = 1;
      },
      /** true if the cell rect lies inside the level and overlaps no claim */
      free(x, y, w, h) {
        if (x < 0 || y < 0 || x + w > this.cols || y + h > this.rows)
          return false;
        for (let cy = y; cy < y + h; cy++)
          for (let cx = x; cx < x + w; cx++)
            if (this.mask[cy * this.cols + cx] === 1) return false;
        return true;
      },
      /** true if the cell rect is free AND spawnable throughout — the placement test for a stamp */
      open(x, y, w, h) {
        if (!this.free(x, y, w, h)) return false;
        for (let cy = y; cy < y + h; cy++)
          for (let cx = x; cx < x + w; cx++)
            if (!this.spawnable(cx, cy)) return false;
        return true;
      },
      /** true if the cell sits inside a claim — the per-cell test for a scatter */
      claimed(x, y) {
        return this.mask[y * this.cols + x] === 1;
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
      /** append every channel of an already-translated LevelData (a stamped prefab) to `out` */
      merge(data) {
        const tiles = data.tiles ?? [];
        for (let i = 0; i < tiles.length; i++) {
          const t = tiles[i];
          const dst = this.rects(t.layer, t.material);
          for (let j = 0; j < t.rects.length; j++) dst.push(t.rects[j]);
        }
        const zones = data.zones ?? [];
        for (let i = 0; i < zones.length; i++) this.out.zones.push(zones[i]);
        const spawns = data.spawns ?? [];
        for (let i = 0; i < spawns.length; i++) this.out.spawns.push(spawns[i]);
      },
    };
    for (let i = 0; i < this.passes.length; i++) {
      const p = this.passes[i];
      // independent per-pass seed: salt folded into the level seed (prime-spread so seed+salt
      // combinations don't alias adjacent level seeds); the stream and the noise both key on it
      const salt = p.salt ?? i + 1;
      ctx.seed = this.seed + salt * 101159;
      ctx.rng = _stream(ctx.seed);
      p.apply(ctx);
    }
    out.terrain = ctx.terrain;
    out.solid = LevelGen._solid(palette, ctx.terrain, cols, rows);
    return out;
  }

  /**
   * Paint a generate() result's terrain into a layer — `types` is one TileType per palette entry.
   * After this the ground IS tile data: LevelGrid.costAt prices nav from it and the render passes
   * draw it, so nothing samples the generator at play time.
   */
  paint(out, layer, types) {
    const cols = out.cols;
    for (let y = 0; y < out.rows; y++)
      for (let x = 0; x < cols; x++)
        layer.set(x, y, types[out.terrain[y * cols + x]]);
  }

  /**
   * Greedy-mesh the impassable cells into the fewest [gx,gy,w,h] rects, so the caller makes one
   * collider per rect not a per-cell box (per-cell seams snag sliding bodies). These stay
   * COLLIDE-ONLY: the material is drawn as ground, so nothing renders them. [] when nothing is.
   */
  static _solid(palette, terrain, cols, rows) {
    let any = false;
    for (let i = 0; i < terrain.length; i++)
      if (palette[terrain[i]].pathCost === null) {
        any = true;
        break;
      }
    if (!any) return [];
    return Grid.meshRects(
      cols,
      rows,
      (x, y) => palette[terrain[y * cols + x]].pathCost === null,
    );
  }
};
