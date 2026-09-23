/**
 * Spatial lookup over entities. Three families: `inRect`/`inRadius` test a POSITION — any
 * entity, a plant or a beacon included, the JS walk — `maskRect`/`maskRadius` ask the runtime
 * for the colliders whose MASK overlaps the shape (the mirrors, PuppetSystem — a solid collider
 * only, since a solid-off one wears the empty mask), so a body whose centre lies outside but
 * whose box reaches in counts, and `cast`/`castAll` are the segment casts over the same mirrors:
 * one `collision_line_list` over `Puppet` — every collider's instance, a Solid's included — then
 * each hit's bbox through the slab test for the entry point, the normal and `t`, since the
 * runtime's list orders by an instance's ORIGIN distance and carries no point. Every runtime form
 * runs from the parked probe (PuppetSystem.probe) and drains the one hit list (PuppetSystem.list)
 * before anything else can ask; the mirrors are as of this tick's PuppetSystem.update, so a hit's
 * id is still validated against the store, and a parked level's mirrors are deactivated. The id
 * forms return ids, `has` narrowing to a component's carriers; a cast's hit is
 * { id, x, y, nx, ny, t }, nx/ny the surface normal pointing back along the ray, t the segment
 * parameter (0 = start, clamped to 0 when the start is inside).
 * @typedef {Object} QueryOpts @property {string} [has] require this component (its token)
 * @typedef {Object} CastOpts @property {number} [ignore] skip this entity (the shooter)
 */
globalThis.Query = {
  _hits: [], // cast()'s scratch — holds the one nearest hit while collecting

  inRect(entities, x1, y1, x2, y2, opts = {}) {
    const result = [];
    Query._each(entities, opts, (id, pos) => {
      if (pos.x < x1 || pos.x > x2 || pos.y < y1 || pos.y > y2) return;
      result.push(id);
    });
    return result;
  },

  inRadius(entities, x, y, radius, opts = {}) {
    const result = [];
    const rSq = radius * radius;
    Query._each(entities, opts, (id, pos) => {
      if ((pos.x - x) ** 2 + (pos.y - y) ** 2 > rSq) return;
      result.push(id);
    });
    return result;
  },

  /** The solid colliders whose mask overlaps the rect. */
  maskRect(entities, x1, y1, x2, y2, opts = {}) {
    const list = PuppetSystem.list();
    const found = PuppetSystem.probe().collision_rectangle_list(x1, y1, x2, y2, Puppet, false, true, list, false);
    return Query._ids(entities, list, found, opts.has);
  },

  /** The solid colliders whose mask overlaps the circle. */
  maskRadius(entities, x, y, radius, opts = {}) {
    const list = PuppetSystem.list();
    const found = PuppetSystem.probe().collision_circle_list(x, y, radius, Puppet, false, true, list, false);
    return Query._ids(entities, list, found, opts.has);
  },

  /** Nearest hit along (x0,y0)->(x1,y1), or null. */
  cast(entities, x0, y0, x1, y1, opts = {}) {
    const hits = Query._hits;
    hits.length = 0;
    Query._collect(entities, x0, y0, x1, y1, opts.ignore, hits, true);
    return hits.length === 0 ? null : hits[0];
  },

  /** Every hit the segment crosses, ASCENDING by entry distance `t` — multi-hit counterpart to cast(). */
  castAll(entities, x0, y0, x1, y1, opts = {}) {
    const hits = [];
    Query._collect(entities, x0, y0, x1, y1, opts.ignore, hits, false);
    // BUG: [#15593] sort by t with a SIGN comparator, NOT `a.t - b.t`.
    hits.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
    return hits;
  },

  /**
   * Visit the candidate set as `(id, pos)`. `has` JOINs the query instead of filtering after
   * it, and the marker leads the token list so the scan gates on the RAREST column first —
   * finding the one NPC among 475 entities stops costing a `has` per entity (docs/ARCHITECTURE.md → Hot-path idioms).
   */
  _each(entities, opts, fn) {
    const extra = opts.has;
    if (extra !== undefined) {
      entities.forEach([extra, Position], (id, _e, pos) => fn(id, pos));
      return;
    }
    entities.forEach([Position], (id, pos) => fn(id, pos));
  },

  /** The list's entities: a live mirror's id, carrying `has` when asked. */
  _ids(entities, list, found, has) {
    const result = [];
    for (let k = 0; k < found; k++) {
      const id = ds_list_find_value(list, k).eid;
      if (id === undefined) continue; // a Puppet that mirrors no entity
      if (!entities.isValid(id)) continue;
      if (has !== undefined) {
        if (!entities.has(id, has)) continue;
      }
      result.push(id);
    }
    return result;
  },

  /** The runtime's line list into `hits`; `nearest` keeps only the closest. */
  _collect(entities, x0, y0, x1, y1, ignore, hits, nearest) {
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
      const r = Query._slab(
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
      Query._add(hits, nearest, id, r, x0, y0, dx, dy);
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
  _slab(x0, y0, dx, dy, bx1, by1, bx2, by2) {
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
