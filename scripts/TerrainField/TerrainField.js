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
 * Every query is a PURE function of cell coords + the seed, so the same seed paints the same level
 * every build — a build is the generator's one run; from there the ground is tile data.
 *
 * The PALETTE is an ordered array of material entries — material id = index = painter order (the
 * terrain layer's TileType ids are `index + 1`, and the render stacks one dual-grid pass per
 * material cumulatively, lowest first):
 *   { id, name?, sprite?, threshold? | ground?, pathCost, spawnable? }
 *   threshold entries FIRST (ascending over the ELEVATION noise channel — e.g. deep water → water →
 *     sand; past the last threshold the cell is land),
 *   then ground entries (ascending over an independent GROUND-detail channel, last one Infinity)
 *     splitting the land — so surface patches vary freely instead of ringing every shoreline as fixed
 *     contour bands (what one shared gradient would do).
 *   pathCost is the weighted movement cost (TileType convention: null → impassable → solidRects
 *     meshes it into collide-only rects); spawnable:false bans placement without blocking travel
 *     (wadeable water). sprite/name are consumer data (the render passes / debug) — not read here.
 * GMRT-safe: index loops, while (no empty for-initializer), class on globalThis.
 */
globalThis.TerrainField = class TerrainField {
  // opts: { seed, lattice, groundLattice, groundSalt } — lattice = noise blob spacing in cells
  // (bigger = larger regions), groundSalt decorrelates the detail channel.
  constructor(palette, opts = {}) {
    this.palette = palette;
    this.seed = (opts.seed ?? 1337) | 0;
    this.lattice = opts.lattice ?? 10;
    this.groundLattice = opts.groundLattice ?? 6;
    this.groundSalt = opts.groundSalt ?? 1013904223;
  }

  /** single-cell material id (index into the palette) */
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
   * per-cell movement cost (1 = easy … Infinity = impassable). The LIVE consumer is the terrain
   * layer's TileType (LevelGrid.costAt) once paint() has run — this is the pre-paint sampler.
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
   * Write every cell's material into `layer` — `types` is one TileType per palette entry, indexed by
   * material id. After this the ground IS tile data: LevelGrid.costAt prices nav from it and the
   * dual-grid passes render it, so nothing samples the field at play time.
   */
  paint(layer, types, cols, rows) {
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        layer.set(x, y, types[this.materialAt(x, y)]);
  }

  /**
   * Greedy-mesh the level's impassable cells into the fewest [gx,gy,w,h] rects, so the caller makes
   * one collider per rect not a per-cell box (per-cell seams snag sliding bodies). These stay
   * COLLIDE-ONLY: the material is drawn as ground, so nothing renders them.
   * Pure in (cols, rows, seed); returns [] when nothing is impassable.
   */
  solidRects(cols, rows) {
    // passable() costs two noise channels per call and the mesh probes a cell repeatedly, so
    // sample the field once into a flat array and let Grid.meshRects read that.
    const blocked = new Array(cols * rows);
    let any = false;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const b = !this.passable(x, y);
        blocked[y * cols + x] = b;
        if (b) any = true;
      }
    if (!any) return [];
    return Grid.meshRects(cols, rows, (x, y) => blocked[y * cols + x]);
  }
};
