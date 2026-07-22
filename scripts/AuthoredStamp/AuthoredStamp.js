// Authored-overlay GEN PASS for a ChunkGenerator — chunks inside the authored bounding box take their
// walls/spawns from hand-built level data instead of procedural content. Contract on the class below.
/**
 * The pass pushes the chunk's authored content (indexed per chunk at construction) and sets
 * `ctx.authored = true`, which the procedural passes (PrefabStamp, scatters) respect by early-outing.
 * Suppression is by BBOX (chunk-coord extent of all authored content), not per-chunk presence, so the
 * hub area stays procedural-free even where sparse. Terrain is untouched — the biome field paints the
 * same continuous ground under authored and wild chunks alike. Run this FIRST in the pass list (draws
 * no rng — its salt is unused).
 */
globalThis.AuthoredStamp = class AuthoredStamp {
  /**
   * opts: data? (level-file data — { walls: [[gx,gy,w,h]...], spawns: [{gx,gy,...}] }), chunkCols?/
   * chunkRows? (cell size — must match the generator's), salt? (per-pass stream salt, unused — no rng
   * drawn).
   * @param {Object} opts
   */
  constructor(opts = {}) {
    this.salt = opts.salt;
    this.chunkCols = opts.chunkCols ?? 16;
    this.chunkRows = opts.chunkRows ?? 16;
    // authored overlay, indexed by "cx,cy" (a wall rect filed by its top-left chunk)
    this._walls = {};
    this._spawns = {};
    // bbox (chunk coords) of authored content — any chunk inside it suppresses procedural
    this._hasAuth = false;
    this._minCx = 0;
    this._minCy = 0;
    this._maxCx = 0;
    this._maxCy = 0;
    if (opts.data !== undefined) this._index(opts.data);
  }

  // stamp the chunk's authored content + claim the chunk (procedural passes check ctx.authored)
  apply(ctx) {
    if (!this._inBox(ctx.cx, ctx.cy)) return;
    ctx.authored = true;
    const k = this._key(ctx.cx, ctx.cy);
    const walls = this._walls[k];
    if (walls !== undefined)
      for (let i = 0; i < walls.length; i++) ctx.out.walls.push(walls[i]);
    const spawns = this._spawns[k];
    if (spawns !== undefined)
      for (let i = 0; i < spawns.length; i++) ctx.out.spawns.push(spawns[i]);
  }

  _key(cx, cy) {
    return cx + "," + cy;
  }

  _chunkOf(gx, gy) {
    return {
      cx: Math.floor(gx / this.chunkCols),
      cy: Math.floor(gy / this.chunkRows),
    };
  }

  // Index the file's walls + spawns into per-chunk buckets. "reach" spawns stay in — the spawn
  // adapter skips them; the level resolves the reach zone separately.
  _index(data) {
    const walls = data.walls ?? [];
    for (let i = 0; i < walls.length; i++) {
      const r = walls[i];
      const c = this._chunkOf(r[0], r[1]);
      this._bump(c.cx, c.cy);
      const k = this._key(c.cx, c.cy);
      (this._walls[k] = this._walls[k] ?? []).push(r);
    }
    const spawns = data.spawns ?? [];
    for (let i = 0; i < spawns.length; i++) {
      const s = spawns[i];
      const c = this._chunkOf(s.gx, s.gy);
      this._bump(c.cx, c.cy);
      const k = this._key(c.cx, c.cy);
      (this._spawns[k] = this._spawns[k] ?? []).push(s);
    }
  }

  _bump(cx, cy) {
    if (!this._hasAuth) {
      this._hasAuth = true;
      this._minCx = this._maxCx = cx;
      this._minCy = this._maxCy = cy;
      return;
    }
    if (cx < this._minCx) this._minCx = cx;
    if (cx > this._maxCx) this._maxCx = cx;
    if (cy < this._minCy) this._minCy = cy;
    if (cy > this._maxCy) this._maxCy = cy;
  }

  _inBox(cx, cy) {
    return (
      this._hasAuth &&
      cx >= this._minCx &&
      cx <= this._maxCx &&
      cy >= this._minCy &&
      cy <= this._maxCy
    );
  }
};
