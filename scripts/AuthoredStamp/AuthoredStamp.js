/**
 * The pass pushes the level file's hand-built content (walls + spawns, already in grid coords) and
 * CLAIMS its extent, which the procedural passes (PrefabStamp, scatters) respect — so the hub area
 * stays procedural-free even where sparse. The claim is the content's BBOX, not its occupied cells:
 * a courtyard inside the hub is part of the hub. Terrain is untouched — the biome field paints the
 * same continuous ground under authored and wild ground alike. Run this FIRST in the pass list (it
 * draws no rng — its salt is unused).
 */
globalThis.AuthoredStamp = class AuthoredStamp {
  /**
   * opts: data? (level-file data — { walls: [[gx,gy,w,h]...], spawns: [{gx,gy,...}] }), margin?
   * (extra cells claimed around the bbox, default 0), salt? (per-pass stream salt, unused — no rng
   * drawn).
   */
  constructor(opts = {}) {
    this.salt = opts.salt;
    this.margin = opts.margin ?? 0;
    this._walls = [];
    this._spawns = [];
    // cell bbox of the authored content — claimed whole, so procedural passes stay clear
    this._has = false;
    this._x1 = 0;
    this._y1 = 0;
    this._x2 = 0;
    this._y2 = 0;
    if (opts.data !== undefined) this._index(opts.data);
  }

  apply(ctx) {
    for (let i = 0; i < this._walls.length; i++)
      ctx.out.walls.push(this._walls[i]);
    for (let i = 0; i < this._spawns.length; i++)
      ctx.out.spawns.push(this._spawns[i]);
    if (!this._has) return;
    const m = this.margin;
    ctx.claim(
      this._x1 - m,
      this._y1 - m,
      this._x2 - this._x1 + 1 + 2 * m,
      this._y2 - this._y1 + 1 + 2 * m,
    );
  }

  /**
   * Collect the file's walls + spawns and grow the bbox over them. "reach" spawns stay in — the
   * spawn adapter skips them; the scene resolves the reach zone separately.
   */
  _index(data) {
    const walls = data.walls ?? [];
    for (let i = 0; i < walls.length; i++) {
      const r = walls[i];
      this._walls.push(r);
      this._grow(r[0], r[1]);
      this._grow(r[0] + r[2] - 1, r[1] + r[3] - 1);
    }
    const spawns = data.spawns ?? [];
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      this._spawns.push(s);
      this._grow(s.gx, s.gy);
    }
  }

  _grow(gx, gy) {
    if (!this._has) {
      this._has = true;
      this._x1 = this._x2 = gx;
      this._y1 = this._y2 = gy;
      return;
    }
    if (gx < this._x1) this._x1 = gx;
    if (gx > this._x2) this._x2 = gx;
    if (gy < this._y1) this._y1 = gy;
    if (gy > this._y2) this._y2 = gy;
  }
};
