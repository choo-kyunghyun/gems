/**
 * The level's one FIXED structure — a prefab (the colony compound, a site's landing pad, a cave
 * mouth) placed once at the open spot nearest `at` (default the level centre): the footprint's
 * top-left corner is ring-scanned outward from the centring corner until the whole footprint is
 * open (spawnable ground free of claims), kept `edge` cells in from the level border. No such spot
 * → the centring corner, and with `fill` set the footprint's wet cells are first drained to that
 * material (a built site stands on dry ground), else Log.warn. The footprint plus `margin` is
 * claimed, so every later pass keeps off it; the prefab's entry marker is what the level builder
 * reads its arrival point from. Draws no rng — its salt is unused. Register the prefab before
 * composing (Prefab.get).
 * GMRT-safe: index loops, class on globalThis.
 */
globalThis.GenAnchor = class GenAnchor {
  /**
   * opts: prefab (required — a registered Prefab id), margin? (cells claimed around the footprint,
   * default 0), edge? (cells kept from the level border, default 1), fill? (the material wet
   * footprint cells drain to on the fallback placement), at? ({ gx, gy } target centre), salt?
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
    const st = LevelData.translate(p, spot.x, spot.y);
    // translate's spawn copy is shallow — deep-copy the records so the level's instances never
    // share (and mutate) the registry def's nested data across builds
    for (let i = 0; i < st.spawns.length; i++)
      st.spawns[i] = GenAnchor._clone(st.spawns[i]);
    ctx.merge(st);
  }

  /** plain-data deep copy; anything that isn't a plain object/array passes by reference */
  static _clone(v) {
    if (Array.isArray(v)) {
      const out = [];
      for (let i = 0; i < v.length; i++) out.push(GenAnchor._clone(v[i]));
      return out;
    }
    if (v !== null && typeof v === "object" && v.constructor === Object) {
      const out = {};
      const keys = Object.keys(v);
      for (let i = 0; i < keys.length; i++)
        out[keys[i]] = GenAnchor._clone(v[keys[i]]);
      return out;
    }
    return v;
  }

  /**
   * Nearest corner to (tx, ty) with an open footprint inside the edge, or null. A footprint is
   * tested in O(1) off a summed-area table of the not-open cells (built once — a 45×30 compound
   * over a 128² level asks thousands of candidates, and a per-cell test made that seconds).
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
    // ring r: walk the square's perimeter only (its top/bottom rows, then its side columns)
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

  /** drain the footprint's wet cells to the fill material */
  _drain(ctx, p, spot) {
    const m = ctx.material(this.fill);
    for (let y = spot.y; y < spot.y + p.rows; y++)
      for (let x = spot.x; x < spot.x + p.cols; x++)
        if (!ctx.spawnable(x, y)) ctx.setMaterial(x, y, m);
  }
};
