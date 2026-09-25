/**
 * The level's one fixed structure: a prefab placed once at the open spot nearest `at` (default
 * the level centre), kept `edge` cells in from the border. With no open spot it falls back to the
 * centred placement, draining the footprint's wet cells to `fill` when set (a built site stands
 * on dry ground), else warning. The footprint plus `margin` is claimed, so every later pass keeps
 * off it. Draws no rng — its salt is unused.
 */
globalThis.GenAnchor = class GenAnchor {
  /**
   * opts: prefab (required, registered before composing), margin?, edge?, fill?, at? ({ gx, gy }),
   * salt?
   */
  constructor(opts = {}) {
    if (typeof opts.prefab !== "string")
      throw new Error("GenAnchor needs a prefab id");
    this.salt = opts.salt;
    this.prefab = opts.prefab;
    this.margin = opts.margin ?? 0;
    this.edge = opts.edge ?? 1;
    this.fill = opts.fill;
    this.at = opts.at;
  }

  apply(ctx) {
    const p = Prefab.get(this.prefab);
    if (p === undefined)
      throw new Error(`GenAnchor: unknown prefab "${this.prefab}"`);
    const e = this.edge;
    if (p.cols + 2 * e > ctx.cols || p.rows + 2 * e > ctx.rows)
      throw new Error(
        `GenAnchor: prefab "${p.id}" (${p.cols}x${p.rows}) does not fit a ${ctx.cols}x${ctx.rows} level`,
      );
    const cx = this.at !== undefined ? this.at.gx : Math.floor(ctx.cols / 2);
    const cy = this.at !== undefined ? this.at.gy : Math.floor(ctx.rows / 2);
    // the corner that centres the footprint on the target, clamped inside the edge
    const tx = Math.min(
      Math.max(cx - Math.floor(p.cols / 2), e),
      ctx.cols - e - p.cols,
    );
    const ty = Math.min(
      Math.max(cy - Math.floor(p.rows / 2), e),
      ctx.rows - e - p.rows,
    );
    let spot = this._scan(ctx, p, tx, ty);
    if (spot === null) {
      spot = { x: tx, y: ty };
      if (this.fill !== undefined) this._drain(ctx, p, spot);
      else
        Log.warn(
          `GenAnchor: no open spot for "${p.id}" — placed at the centre`,
        );
    }
    const m = this.margin;
    ctx.claim(spot.x - m, spot.y - m, p.cols + 2 * m, p.rows + 2 * m);
    ctx.merge(LevelData.translate(p, spot.x, spot.y));
  }

  /**
   * Nearest corner to (tx, ty) with an open footprint inside the edge, or null. A footprint is
   * tested in O(1) off a summed-area table — a large prefab asks thousands of candidates.
   */
  _scan(ctx, p, tx, ty) {
    const cols = ctx.cols;
    const rows = ctx.rows;
    const W = cols + 1;
    const sum = new Int32Array(W * (rows + 1)); // sum[(y+1)*W + x+1] = not-open cells in [0,x]×[0,y]
    for (let y = 0; y < rows; y++) {
      let row = 0;
      for (let x = 0; x < cols; x++) {
        if (ctx.claimed(x, y) || !ctx.spawnable(x, y)) row++;
        sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + row;
      }
    }
    const blocked = (x, y) =>
      sum[(y + p.rows) * W + x + p.cols] -
      sum[y * W + x + p.cols] -
      sum[(y + p.rows) * W + x] +
      sum[y * W + x];
    const e = this.edge;
    const x1 = e;
    const y1 = e;
    const x2 = cols - e - p.cols; // last corner still inside the edge
    const y2 = rows - e - p.rows;
    const fits = (x, y) =>
      x >= x1 && y >= y1 && x <= x2 && y <= y2 && blocked(x, y) === 0;
    if (fits(tx, ty)) return { x: tx, y: ty };
    const rMax = Math.max(cols, rows);
    for (let r = 1; r < rMax; r++) {
      for (let dx = -r; dx <= r; dx++) {
        if (fits(tx + dx, ty - r)) return { x: tx + dx, y: ty - r };
        if (fits(tx + dx, ty + r)) return { x: tx + dx, y: ty + r };
      }
      for (let dy = -r + 1; dy <= r - 1; dy++) {
        if (fits(tx - r, ty + dy)) return { x: tx - r, y: ty + dy };
        if (fits(tx + r, ty + dy)) return { x: tx + r, y: ty + dy };
      }
    }
    return null;
  }

  _drain(ctx, p, spot) {
    const m = ctx.material(this.fill);
    for (let y = spot.y; y < spot.y + p.rows; y++)
      for (let x = spot.x; x < spot.x + p.cols; x++)
        if (!ctx.spawnable(x, y)) ctx.setMaterial(x, y, m);
  }
};
