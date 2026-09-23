/**
 * The ground stage: every cell takes a material off a value-noise band table. It is the level's
 * base, so it runs first and writes every cell. `bands` is [[materialId, threshold]...] ascending
 * over the noise, the last threshold Infinity (a band is [previous threshold, its own));
 * `lattice` is the noise blob spacing in cells. Pure in (seed, cell) and draws no rng, so the
 * same seed lays the same ground.
 */
globalThis.GenGround = class GenGround {
  /** opts: bands (required), lattice?, salt? */
  constructor(opts = {}) {
    if (!Array.isArray(opts.bands) || opts.bands.length === 0)
      throw new Error("GenGround needs a band table");
    this.salt = opts.salt;
    this.lattice = opts.lattice ?? 6;
    this.bands = opts.bands;
  }

  apply(ctx) {
    const ids = [];
    const cuts = [];
    for (let i = 0; i < this.bands.length; i++) {
      ids.push(ctx.material(this.bands[i][0]));
      cuts.push(this.bands[i][1]);
    }
    const last = ids.length - 1;
    for (let y = 0; y < ctx.rows; y++)
      for (let x = 0; x < ctx.cols; x++) {
        const n = noise2(x, y, ctx.seed, this.lattice);
        let i = 0;
        while (i < last && n >= cuts[i]) i++;
        ctx.setMaterial(x, y, ids[i]);
      }
  }
};
