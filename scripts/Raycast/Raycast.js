// Segment-vs-AABB raycast over all collider entities. Returns nearest hit { id, x, y, nx, ny, t } along
// (x0,y0)->(x1,y1), or null. Shared by ProjectileSystem + LOS. opts: { ignore? (id), solidOnly? (true) }.
globalThis.Raycast = {
  /**
   * @param {Entity} entities
   * @param {number} x0
   * @param {number} y0
   * @param {number} x1
   * @param {number} y1
   * @param {Object} [opts={}]
   * @returns {{id:number,x:number,y:number,nx:number,ny:number,t:number}|null}
   */
  cast(entities, x0, y0, x1, y1, opts = {}) {
    const ignore = opts.ignore;

    const dx = x1 - x0;
    const dy = y1 - y0;

    let best = null;
    let bestT = Infinity;

    for (const id of entities.query(Collision, Position, BBox)) {
      if (id === ignore) continue;

      const col = entities.get(Collision, id);
      // read opts.solidOnly inline — never cache it in a bool local (the &&-clobber quirk, #15549)
      if (opts.solidOnly !== false && !col.solid) continue;

      const e = AABB.of(entities, id);
      const r = Raycast._segmentAABB(x0, y0, dx, dy, e.x1, e.y1, e.x2, e.y2);
      if (r !== null && r.t < bestT) {
        bestT = r.t;
        best = {
          id,
          x: x0 + dx * r.t,
          y: y0 + dy * r.t,
          nx: r.nx,
          ny: r.ny,
          t: r.t,
        };
      }
    }
    return best;
  },

  // Every solid collider the segment crosses, ASCENDING by entry distance `t` — multi-hit
  // counterpart to cast(). Used by hitscan pierce walks (Combat.hitscan) needing every body, not just the nearest.
  /**
   * @param {Entity} entities
   * @param {number} x0
   * @param {number} y0
   * @param {number} x1
   * @param {number} y1
   * @param {Object} [opts={}]
   * @returns {{id:number,x:number,y:number,nx:number,ny:number,t:number}[]}
   */
  castAll(entities, x0, y0, x1, y1, opts = {}) {
    const ignore = opts.ignore;

    const dx = x1 - x0;
    const dy = y1 - y0;

    const hits = [];

    for (const id of entities.query(Collision, Position, BBox)) {
      if (id === ignore) continue;

      const col = entities.get(Collision, id);
      // solidOnly read inline (default on) — see the boolean-local clobber note in cast().
      if (opts.solidOnly !== false && !col.solid) continue;

      const e = AABB.of(entities, id);
      const r = Raycast._segmentAABB(x0, y0, dx, dy, e.x1, e.y1, e.x2, e.y2);
      if (r !== null) {
        hits.push({
          id,
          x: x0 + dx * r.t,
          y: y0 + dy * r.t,
          nx: r.nx,
          ny: r.ny,
          t: r.t,
        });
      }
    }
    // BUG: [#15593] sort by t with a SIGN comparator, NOT `a.t - b.t`.
    hits.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
    return hits;
  },

  /**
   * Slab test of the segment vs an AABB. Returns { t, nx, ny } at entry (t clamped to 0 if
   * starting inside), or null. nx/ny is the surface normal pointing back along the ray.
   * @param {number} x0
   * @param {number} y0
   * @param {number} dx
   * @param {number} dy
   * @param {number} bx1
   * @param {number} by1
   * @param {number} bx2
   * @param {number} by2
   * @returns {{t:number,nx:number,ny:number}|null}
   */
  _segmentAABB(x0, y0, dx, dy, bx1, by1, bx2, by2) {
    let txEntry, txExit, tyEntry, tyExit;

    if (dx > 0) {
      txEntry = (bx1 - x0) / dx;
      txExit = (bx2 - x0) / dx;
    } else if (dx < 0) {
      txEntry = (bx2 - x0) / dx;
      txExit = (bx1 - x0) / dx;
    } else {
      if (x0 < bx1 || x0 > bx2) return null;
      txEntry = -Infinity;
      txExit = Infinity;
    }

    if (dy > 0) {
      tyEntry = (by1 - y0) / dy;
      tyExit = (by2 - y0) / dy;
    } else if (dy < 0) {
      tyEntry = (by2 - y0) / dy;
      tyExit = (by1 - y0) / dy;
    } else {
      if (y0 < by1 || y0 > by2) return null;
      tyEntry = -Infinity;
      tyExit = Infinity;
    }

    const tEntry = Math.max(txEntry, tyEntry);
    const tExit = Math.min(txExit, tyExit);

    if (tEntry > tExit || tEntry > 1 || tExit < 0) return null;

    return {
      t: Math.max(tEntry, 0),
      nx: txEntry > tyEntry ? (dx > 0 ? -1 : 1) : 0,
      ny: txEntry > tyEntry ? 0 : dy > 0 ? -1 : 1,
    };
  },
};
