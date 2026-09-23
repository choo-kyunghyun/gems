/**
 * The placement half of a scatter: spawn descriptors strewn at a per-1000-cell density, each on
 * an open footprint `margin` cells in from the border. What is placed is the `spawn` hook's;
 * where it lands is decided here. A failed try is dropped, not retried: the count is a density,
 * not a quota, so a level that is mostly water simply carries fewer. With `claim`, nothing later
 * stands inside a placed footprint.
 */
globalThis.GenScatter = class GenScatter {
  /**
   * opts: spawn(ctx, gx, gy, w, h) (required; undefined skips the try), density?, size?
   * (rng → { w, h }), claim?, margin?, salt?
   */
  constructor(opts = {}) {
    if (typeof opts.spawn !== "function")
      throw new Error("GenScatter needs a spawn hook");
    this.salt = opts.salt;
    this.density = opts.density ?? 1;
    this.margin = opts.margin ?? 1;
    this.size = opts.size;
    this.spawn = opts.spawn;
    this.claim = opts.claim === true;
  }

  apply(ctx) {
    const rng = ctx.rng;
    const count = Math.round((this.density * ctx.cols * ctx.rows) / 1000);
    const m = this.margin;
    for (let n = 0; n < count; n++) {
      let w = 1;
      let h = 1;
      if (this.size !== undefined) {
        const s = this.size(rng);
        w = s.w;
        h = s.h;
      }
      const maxX = ctx.cols - 2 * m - w;
      const maxY = ctx.rows - 2 * m - h;
      if (maxX < 0 || maxY < 0) continue;
      const gx = m + Math.floor(rng() * (maxX + 1));
      const gy = m + Math.floor(rng() * (maxY + 1));
      if (!ctx.open(gx, gy, w, h)) continue;
      const s = this.spawn(ctx, gx, gy, w, h);
      if (s === undefined) continue;
      if (this.claim) ctx.claim(gx, gy, w, h);
      ctx.out.spawns.push(s);
    }
  }
};
