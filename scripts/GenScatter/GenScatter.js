/**
 * The ENTITIES stage: descriptors strewn across the level at a per-1000-cell DENSITY — the
 * placement half of a scatter. Each try draws a footprint (`size(rng)` → { w, h }, default 1×1)
 * and a corner `margin` cells in from the border, requires the footprint to be open (spawnable
 * ground free of claims), then asks `spawn(ctx, gx, gy, w, h)` for the descriptor — undefined
 * skips the try — and pushes it; with `claim` set the footprint is claimed, so nothing later
 * stands inside it (a boulder). A try that fails the placement test is dropped, not retried: the
 * count is a density, not a quota, so a level that is mostly water simply carries fewer. What a
 * scatter places is the consumer's (a LevelData spawn is opaque — OverworldGen's tree/rock/rat);
 * where it lands is decided here.
 * GMRT-safe: index loops, class on globalThis.
 */
globalThis.GenScatter = class GenScatter {
  /**
   * opts: spawn (required — the descriptor hook), density? (per 1000 cells, default 1), size?
   * (footprint hook, rng → { w, h }), claim? (default false), margin? (default 1), salt?
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
      if (maxX < 0 || maxY < 0) continue; // wider than the interior — the stream still advances
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
