/**
 * The WALLS stage: wall tiles from noise — a cell whose noise reaches `threshold` becomes a wall
 * on `layer` (default "wall", `material` optional), plus a ring around the level when `border` is
 * set (a cave's shell). Claimed cells stay open, so an anchor placed before this pass keeps its
 * pocket; every wall cell is claimed in turn, so later stamps and scatters land only in open
 * space. Emitted greedy-meshed (Grid.meshRects) into one tiles entry. Draws no rng.
 * TODO: no connectivity guarantee — a pocket the noise seals off can hold a stamped structure
 * nobody can walk to.
 * GMRT-safe: index loops, class on globalThis.
 */
globalThis.GenWalls = class GenWalls {
  /**
   * opts: lattice? (default 4), threshold? (noise ≥ this is wall, default 0.6), layer? (default
   * "wall"), material? (the layer's material key), border? (default false), salt?
   */
  constructor(opts = {}) {
    this.salt = opts.salt;
    this.lattice = opts.lattice ?? 4;
    this.threshold = opts.threshold ?? 0.6;
    this.layer = opts.layer ?? "wall";
    this.material = opts.material;
    this.border = opts.border === true;
  }

  apply(ctx) {
    const cols = ctx.cols;
    const rows = ctx.rows;
    const solid = new Uint8Array(cols * rows);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        if (ctx.claimed(x, y)) continue;
        let wall = false;
        if (this.border)
          wall = x === 0 || y === 0 || x === cols - 1 || y === rows - 1;
        if (!wall) wall = noise2(x, y, ctx.seed, this.lattice) >= this.threshold;
        if (!wall) continue;
        solid[y * cols + x] = 1;
        ctx.claim(x, y, 1, 1);
      }
    const rects = Grid.meshRects(cols, rows, (x, y) => solid[y * cols + x] === 1);
    if (rects.length === 0) return;
    const dst = ctx.rects(this.layer, this.material);
    for (let i = 0; i < rects.length; i++) dst.push(rects[i]);
  }
};
