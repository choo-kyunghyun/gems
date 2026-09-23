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
 * @typedef {Object} QueryOpts
 *   @property {number} [ignore] skip this entity (the asker itself)
 *   @property {string} [has] the id forms only: require this component (its token)
 *   @property {boolean} [ordered] maskRadius only: nearest first, by the distance from the
 *   centre to each mirror's origin — its box centre (PuppetSystem)
 */
globalThis.Query = {
  _nx: 0, // _slab's entry normal, read right after the hit it returned
  _ny: 0,

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
    return Query._ids(entities, list, found, opts);
  },

  /** The solid colliders whose mask overlaps the circle, nearest first when `ordered`. */
  maskRadius(entities, x, y, radius, opts = {}) {
    const list = PuppetSystem.list();
    const ordered = opts.ordered === true;
    const found = PuppetSystem.probe().collision_circle_list(x, y, radius, Puppet, false, true, list, ordered);
    return Query._ids(entities, list, found, opts);
  },

  /** Nearest hit along (x0,y0)->(x1,y1), or null. */
  cast(entities, x0, y0, x1, y1, opts = {}) {
    const ignore = opts.ignore;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const list = PuppetSystem.list();
    const found = Query._line(x0, y0, x1, y1, list);
    let bestT = Infinity;
    let bestId = -1;
    let nx = 0;
    let ny = 0;
    for (let k = 0; k < found; k++) {
      const inst = ds_list_find_value(list, k);
      const id = inst.eid;
      if (id === undefined) continue; // a Puppet that mirrors no entity (a probe, a test's doll)
      if (id === ignore) continue;
      const t = Query._slab(x0, y0, dx, dy, inst.bbox_left, inst.bbox_top, inst.bbox_right, inst.bbox_bottom);
      if (t < 0 || t >= bestT) continue;
      if (!entities.isValid(id)) continue; // removed since the mirror's sync (PuppetSystem)
      bestT = t;
      bestId = id;
      nx = Query._nx;
      ny = Query._ny;
    }
    if (bestT === Infinity) return null;
    return { id: bestId, x: x0 + dx * bestT, y: y0 + dy * bestT, nx, ny, t: bestT };
  },

  /** Every hit the segment crosses, ASCENDING by entry distance `t` — multi-hit counterpart to cast(). */
  castAll(entities, x0, y0, x1, y1, opts = {}) {
    const ignore = opts.ignore;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const list = PuppetSystem.list();
    const found = Query._line(x0, y0, x1, y1, list);
    const hits = [];
    for (let k = 0; k < found; k++) {
      const inst = ds_list_find_value(list, k);
      const id = inst.eid;
      if (id === undefined) continue; // a Puppet that mirrors no entity
      if (id === ignore) continue;
      const t = Query._slab(x0, y0, dx, dy, inst.bbox_left, inst.bbox_top, inst.bbox_right, inst.bbox_bottom);
      if (t < 0) continue;
      if (!entities.isValid(id)) continue;
      hits.push({ id, x: x0 + dx * t, y: y0 + dy * t, nx: Query._nx, ny: Query._ny, t });
    }
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
    const ignore = opts.ignore;
    if (extra !== undefined) {
      entities.forEach([extra, Position], (id, _e, pos) => {
        if (id !== ignore) fn(id, pos);
      });
      return;
    }
    entities.forEach([Position], (id, pos) => {
      if (id !== ignore) fn(id, pos);
    });
  },

  /** The list's entities: a live mirror's id other than `ignore`, carrying `has` when asked. */
  _ids(entities, list, found, opts) {
    const has = opts.has;
    const ignore = opts.ignore;
    const result = [];
    for (let k = 0; k < found; k++) {
      const id = ds_list_find_value(list, k).eid;
      if (id === undefined) continue; // a Puppet that mirrors no entity
      if (id === ignore) continue;
      if (!entities.isValid(id)) continue;
      if (has !== undefined) {
        if (!entities.has(id, has)) continue;
      }
      result.push(id);
    }
    return result;
  },

  /** The runtime's line list over every mirror into `list`, unordered; returns the count. */
  _line(x0, y0, x1, y1, list) {
    return PuppetSystem.probe().collision_line_list(x0, y0, x1, y1, Puppet, false, true, list, false);
  },

  /**
   * Slab test of the segment vs an AABB: the entry `t` (clamped to 0 when starting inside), or
   * -1 on a miss. The entry normal, pointing back along the ray, lands in `_nx`/`_ny`.
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
      if (x0 < bx1 || x0 > bx2) return -1;
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
      if (y0 < by1 || y0 > by2) return -1;
      tyEntry = -Infinity;
      tyExit = Infinity;
    }

    const tEntry = Math.max(txEntry, tyEntry);
    const tExit = Math.min(txExit, tyExit);

    if (tEntry > tExit || tEntry > 1 || tExit < 0) return -1;

    const xFace = txEntry > tyEntry;
    Query._nx = xFace ? (dx > 0 ? -1 : 1) : 0;
    Query._ny = xFace ? 0 : dy > 0 ? -1 : 1;
    return Math.max(tEntry, 0);
  },
};
