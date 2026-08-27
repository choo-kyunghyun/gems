/**
 * The LAKES stage: water bodies carved into the ground. An independent noise channel below a band's
 * threshold turns the cell into that band's material — ascending, so deep water → water → shore —
 * and past the last threshold the cell keeps its ground. `lattice` sets the body size (bigger =
 * broader lakes). Claimed cells are skipped, so a structure placed before this pass stays dry.
 * Pure in (ctx.seed, cell); draws no rng.
 * GMRT-safe: index loops, class on globalThis.
 */
globalThis.GenLakes = class GenLakes {
  /** opts: bands (required — [[materialId, threshold]...] ascending), lattice? (default 10), salt? */
  constructor(opts = {}) {
    if (!Array.isArray(opts.bands) || opts.bands.length === 0)
      throw new Error("GenLakes needs a band table");
    this.salt = opts.salt;
    this.lattice = opts.lattice ?? 10;
    this.bands = opts.bands;
  }

  apply(ctx) {
    const ids = [];
    const cuts = [];
    for (let i = 0; i < this.bands.length; i++) {
      ids.push(ctx.material(this.bands[i][0]));
      cuts.push(this.bands[i][1]);
    }
    for (let y = 0; y < ctx.rows; y++)
      for (let x = 0; x < ctx.cols; x++) {
        if (ctx.claimed(x, y)) continue;
        const n = noise2(x, y, ctx.seed, this.lattice);
        for (let i = 0; i < ids.length; i++)
          if (n < cuts[i]) {
            ctx.setMaterial(x, y, ids[i]);
            break;
          }
      }
  }
};
