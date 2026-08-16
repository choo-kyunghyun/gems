/**
 * value noise in [0,1): smoothstep-interpolated over a hashed integer lattice; pure in
 * (x, y, seed, lattice). Fold a salt into `seed` to draw an independent channel.
 */
function _noise2(x, y, seed, lattice) {
  const fx = x / lattice;
  const fy = y / lattice;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  let tx = fx - ix;
  let ty = fy - iy;
  tx = tx * tx * (3 - 2 * tx); // smoothstep for blobby, non-grid-aligned regions
  ty = ty * ty * (3 - 2 * ty);
  const v00 = hash2(ix, iy, seed);
  const v10 = hash2(ix + 1, iy, seed);
  const v01 = hash2(ix, iy + 1, seed);
  const v11 = hash2(ix + 1, iy + 1, seed);
  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * ty;
}

/**
 * Every query is a PURE function of absolute cell coords + the seed, so adjacent chunks agree at seams
 * and a chunk regenerates identically every visit (the streaming contract).
 *
 * The PALETTE is an ordered array of material entries — material id = index = painter order
 * (TerrainStream stacks per-material dual-grid layers cumulatively, lowest first):
 *   { id, name?, sprite?, threshold? | ground?, pathCost, spawnable? }
 *   threshold entries FIRST (ascending over the ELEVATION noise channel — e.g. deep water → water →
 *     sand; past the last threshold the cell is land),
 *   then ground entries (ascending over an independent GROUND-detail channel, last one Infinity)
 *     splitting the land — so surface patches vary freely instead of ringing every shoreline as fixed
 *     contour bands (what one shared gradient would do).
 *   pathCost is the weighted movement cost (TileType convention: null → impassable → solidTerrain
 *     meshes it into collide-only rects); spawnable:false bans placement without blocking travel
 *     (wadeable water). sprite/name are consumer data (TerrainStream / debug) — not read here.
 * GMRT-safe: index loops, while (no empty for-initializer), class on globalThis.
 */
globalThis.TerrainField = class TerrainField {
  // opts: { seed, chunkCols, chunkRows, lattice, groundLattice, groundSalt } — lattice = noise
  // blob spacing in cells (bigger = larger regions), groundSalt decorrelates the detail channel.
  constructor(palette, opts = {}) {
    this.palette = palette;
    this.seed = (opts.seed ?? 1337) | 0;
    this.chunkCols = opts.chunkCols ?? 16;
    this.chunkRows = opts.chunkRows ?? 16;
    this.lattice = opts.lattice ?? 10;
    this.groundLattice = opts.groundLattice ?? 6;
    this.groundSalt = opts.groundSalt ?? 1013904223;
  }

  /**
   * Per-cell material grid for one chunk, row-major (a pure coord fn per cell — never per-chunk
   * RNG, which would tear at seams).
   */
  terrain(cx, cy) {
    const cc = this.chunkCols;
    const cr = this.chunkRows;
    const gx0 = cx * cc;
    const gy0 = cy * cr;
    const out = new Array(cc * cr);
    for (let ly = 0; ly < cr; ly++)
      for (let lx = 0; lx < cc; lx++)
        out[ly * cc + lx] = this.materialAt(gx0 + lx, gy0 + ly);
    return out;
  }

  /** single-cell material id (index into the palette) — TerrainStream's seam apron samples this */
  materialAt(ax, ay) {
    const pal = this.palette;
    const n = _noise2(ax, ay, this.seed, this.lattice);
    let i = 0;
    // GMRT: while, not for (empty-initializer for crashes the compiler)
    while (pal[i].threshold !== undefined) {
      if (n < pal[i].threshold) return i;
      i++;
    }
    const g = _noise2(ax, ay, this.seed + this.groundSalt, this.groundLattice);
    while (i < pal.length - 1 && g >= pal[i].ground) i++;
    return i;
  }

  /** true if walkable (pathCost !== null); feeds the solid mesh */
  passable(ax, ay) {
    return this.palette[this.materialAt(ax, ay)].pathCost !== null;
  }

  /**
   * per-cell movement cost (1 = easy … Infinity = impassable) — NavGrid's weight sampler +
   * PathFollow's speed pricing
   */
  costAt(ax, ay) {
    const c = this.palette[this.materialAt(ax, ay)].pathCost;
    return c === null ? Infinity : c;
  }

  /**
   * true if entities may be PLACED here: walkable and not flagged spawnable:false (wadeable water —
   * travel yes, homes no; impassable cells also carry colliders a dynamic body would snag in)
   */
  spawnable(ax, ay) {
    const e = this.palette[this.materialAt(ax, ay)];
    return e.pathCost !== null && e.spawnable !== false;
  }

  /**
   * Greedy-mesh a chunk's impassable cells into the fewest [gx,gy,w,h] rects, so the streamer makes
   * one collider per rect not a per-cell box (per-cell seams snag sliding bodies).
   * Pure in (cx, cy, seed); returns [] when nothing is impassable.
   */
  solidTerrain(cx, cy) {
    const cc = this.chunkCols;
    const cr = this.chunkRows;
    const gx0 = cx * cc;
    const gy0 = cy * cr;
    const blocked = new Array(cc * cr);
    let any = false;
    for (let ly = 0; ly < cr; ly++)
      for (let lx = 0; lx < cc; lx++) {
        const b = !this.passable(gx0 + lx, gy0 + ly);
        blocked[ly * cc + lx] = b;
        if (b) any = true;
      }
    if (!any) return [];

    // Greedy mesh: extend right for width, then down while the whole row stays blocked.
    const consumed = new Array(cc * cr).fill(false);
    const solid = (x, y) =>
      x < cc && y < cr && blocked[y * cc + x] && !consumed[y * cc + x];
    const rects = [];
    for (let y = 0; y < cr; y++) {
      for (let x = 0; x < cc; x++) {
        if (!solid(x, y)) continue;
        let w = 1;
        while (solid(x + w, y)) w++;
        let h = 1;
        for (let grow = true; grow; h++) {
          for (let k = 0; k < w; k++)
            if (!solid(x + k, y + h)) {
              grow = false;
              break;
            }
        }
        h--; // last iteration that incremented also set grow=false
        for (let yy = y; yy < y + h; yy++)
          for (let xx = x; xx < x + w; xx++) consumed[yy * cc + xx] = true;
        rects.push([gx0 + x, gy0 + y, w, h]);
      }
    }
    return rects;
  }
};
