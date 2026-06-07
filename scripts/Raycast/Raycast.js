// Segment-vs-AABB raycast over all collider entities. Returns the nearest hit
// { id, x, y, nx, ny, t } along the segment (x0,y0)->(x1,y1), or null. Shared by
// ProjectileSystem (bullets) and line-of-sight queries.
//
//   opts: { ignore?:    number,        entity id to skip (e.g. the shooter)
//           solidOnly?: boolean,       only test solid colliders (default true)
//           mask?:      string[]|null } if set, also require a matching Tag
globalThis.Raycast = class Raycast {
  static cast(world, x0, y0, x1, y1, opts = {}) {
    const ignore = opts.ignore;
    const solidOnly = opts.solidOnly !== false;
    const mask = opts.mask ?? null;

    const dx = x1 - x0;
    const dy = y1 - y0;

    let best = null;
    let bestT = Infinity;

    for (const id of world.query(Collision, Position, BBox)) {
      if (id === ignore) continue;

      const col = world.get(Collision, id);
      if (solidOnly && !col.solid) continue;
      if (mask !== null && !Raycast._accepts(mask, world.get(Tag, id)))
        continue;

      const e = AABB.of(world, id);
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
  }

  // Slab test of the segment (x0,y0) + (dx,dy)*t, t in [0,1], against an AABB.
  // Returns { t, nx, ny } at the entry point (t clamped to 0 if it starts inside),
  // or null. nx/ny is the surface normal pointing back along the ray.
  static _segmentAABB(x0, y0, dx, dy, bx1, by1, bx2, by2) {
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
  }

  static _accepts(mask, tag) {
    if (tag === undefined) return false;
    for (const t of mask) if (tag.tags.has(t)) return true;
    return false;
  }
};
