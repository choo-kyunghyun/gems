/**
 * Segment casts against the SOLID colliders, both halves off SolidSystem's per-tick collider pass
 * (the store holds ~80% statics, so no cast scans it): the kinematic solids through the static
 * snapshot's bucket grid (a DDA walk — a cast costs the cells it crosses), the dynamic bodies through
 * its body list, with `solid` read live (a corpse or an open door is not a hit). A hit is
 * { id, x, y, nx, ny, t }, nx/ny the surface normal pointing back along the ray, t the segment
 * parameter (0 = start, clamped to 0 when the start is inside). Both lists can lag a removal by a
 * tick, so a hit's id is validated against the store.
 *   opts: { ignore? (id) }
 */
globalThis.Raycast = {
  _rect: AABB.rect(), // reused per-candidate edges (docs/PERF.md)
  _hits: [], // cast()'s scratch — holds the one nearest hit while collecting
  // per static index, the cast that last tested it: a multi-cell static sits in every bucket it
  // spans, and this is the dedupe (a generation stamp, never a fill — docs/PERF.md)
  _seen: [],
  _gen: 0,

  /** Nearest hit along (x0,y0)->(x1,y1), or null. */
  cast(entities, x0, y0, x1, y1, opts = {}) {
    const hits = Raycast._hits;
    hits.length = 0;
    Raycast._collect(entities, x0, y0, x1, y1, opts.ignore, hits, true);
    return hits.length === 0 ? null : hits[0];
  },

  /** Every hit the segment crosses, ASCENDING by entry distance `t` — multi-hit counterpart to cast(). */
  castAll(entities, x0, y0, x1, y1, opts = {}) {
    const hits = [];
    Raycast._collect(entities, x0, y0, x1, y1, opts.ignore, hits, false);
    // BUG: [#15593] sort by t with a SIGN comparator, NOT `a.t - b.t`.
    hits.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
    return hits;
  },

  /**
   * Both halves into `hits`. `nearest` keeps only the closest (the bodies go first, so their best t
   * bounds the static walk, which then stops at the first cell entered past it).
   */
  _collect(entities, x0, y0, x1, y1, ignore, hits, nearest) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const rect = Raycast._rect;
    let bestT = Infinity;

    SolidSystem.eachBody(entities, (id, col, pos, box) => {
      if (id === ignore) return;
      if (!col.solid) return;
      const e = AABB.edgesInto(pos, box, rect);
      const r = Raycast._segmentAABB(x0, y0, dx, dy, e.x1, e.y1, e.x2, e.y2);
      if (r === null) return;
      if (!entities.isValid(id)) return; // removed since the list (SolidSystem.eachBody)
      if (nearest) {
        if (r.t >= bestT) return;
        bestT = r.t;
      }
      Raycast._add(hits, nearest, id, r, x0, y0, dx, dy);
    });

    const statics = SolidSystem.statics(entities);
    const seen = Raycast._seen;
    while (seen.length < statics.length) seen.push(0);
    const gen = ++Raycast._gen;
    SolidSystem.walk(x0, y0, x1, y1, (bucket, tEntry) => {
      if (nearest) {
        if (tEntry > bestT) return false;
      }
      for (let k = 0; k < bucket.length; k++) {
        const i = bucket[k];
        if (seen[i] === gen) continue;
        seen[i] = gen;
        const s = statics[i];
        if (s.id === ignore) continue;
        const r = Raycast._segmentAABB(x0, y0, dx, dy, s.x1, s.y1, s.x2, s.y2);
        if (r === null) continue;
        if (!entities.isValid(s.id)) continue; // removed since the snapshot (SolidSystem.statics)
        if (nearest) {
          if (r.t >= bestT) continue;
          bestT = r.t;
        }
        Raycast._add(hits, nearest, s.id, r, x0, y0, dx, dy);
      }
      return true;
    });
  },

  _add(hits, nearest, id, r, x0, y0, dx, dy) {
    const hit = {
      id,
      x: x0 + dx * r.t,
      y: y0 + dy * r.t,
      nx: r.nx,
      ny: r.ny,
      t: r.t,
    };
    if (!nearest) hits.push(hit);
    else if (hits.length === 0) hits.push(hit);
    else hits[0] = hit;
  },

  /**
   * Slab test of the segment vs an AABB. Returns { t, nx, ny } at entry (t clamped to 0 if
   * starting inside), or null. nx/ny is the surface normal pointing back along the ray.
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
