/**
 * Segment casts over the mirrors (PuppetSystem): one `collision_line_list` over `Puppet` —
 * every collider's instance, a Solid's included — from the parked probe (PuppetSystem.probe), then
 * each hit's bbox through the slab test for the entry point, the normal and `t`, since the
 * runtime's list orders by an instance's ORIGIN distance and carries no point. A solid-off
 * collider wears the empty mask, so it never lists (a corpse or an open door is not a hit), and
 * a parked level's mirrors are deactivated. A hit is { id, x, y, nx, ny, t }, nx/ny the surface
 * normal pointing back along the ray, t the segment parameter (0 = start, clamped to 0 when the
 * start is inside). The mirrors are as of this tick's PuppetSystem.update, so a hit's id is
 * still validated against the store. Every cast takes the LEVEL (its store).
 *   opts: { ignore? (id) }
 */
globalThis.Raycast = {
  _hits: [], // cast()'s scratch — holds the one nearest hit while collecting

  /** Nearest hit along (x0,y0)->(x1,y1), or null. */
  cast(level, x0, y0, x1, y1, opts = {}) {
    const hits = Raycast._hits;
    hits.length = 0;
    Raycast._collect(level, x0, y0, x1, y1, opts.ignore, hits, true);
    return hits.length === 0 ? null : hits[0];
  },

  /** Every hit the segment crosses, ASCENDING by entry distance `t` — multi-hit counterpart to cast(). */
  castAll(level, x0, y0, x1, y1, opts = {}) {
    const hits = [];
    Raycast._collect(level, x0, y0, x1, y1, opts.ignore, hits, false);
    // BUG: [#15593] sort by t with a SIGN comparator, NOT `a.t - b.t`.
    hits.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
    return hits;
  },

  /** The runtime's list into `hits`; `nearest` keeps only the closest. */
  _collect(level, x0, y0, x1, y1, ignore, hits, nearest) {
    const entities = level.entities;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const list = PuppetSystem.list();
    const found = PuppetSystem.probe().collision_line_list(
      x0,
      y0,
      x1,
      y1,
      Puppet,
      false,
      true,
      list,
      false,
    );
    let bestT = Infinity;
    for (let k = 0; k < found; k++) {
      const inst = ds_list_find_value(list, k);
      const id = inst.eid;
      if (id === undefined) continue; // a Puppet that mirrors no entity (a probe, a test's doll)
      if (id === ignore) continue;
      const r = Raycast._segmentAABB(
        x0,
        y0,
        dx,
        dy,
        inst.bbox_left,
        inst.bbox_top,
        inst.bbox_right,
        inst.bbox_bottom,
      );
      if (r === null) continue;
      if (!entities.isValid(id)) continue; // removed since the mirror's sync (PuppetSystem)
      if (nearest) {
        if (r.t >= bestT) continue;
        bestT = r.t;
      }
      Raycast._add(hits, nearest, id, r, x0, y0, dx, dy);
    }
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
