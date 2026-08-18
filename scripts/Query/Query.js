// Spatial lookup over entities with Position. Point tests only (no BBox — that's AABB's job).
/** @typedef {Object} QueryOpts @property {string} [has] require this component (its token) @property {number} [maxDist] cap search radius (world px) @property {boolean} [hasCollision] require a Collision component */
globalThis.Query = {
  nearest(entities, x, y, opts = {}) {
    let bestId = -1;
    let bestDist =
      opts.maxDist !== undefined ? opts.maxDist * opts.maxDist : Infinity;
    Query._each(entities, opts, (id, pos) => {
      const d = (pos.x - x) ** 2 + (pos.y - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    });
    return bestId;
  },

  farthest(entities, x, y, opts = {}) {
    let bestId = -1;
    let bestDist = -1;
    const maxDistSq =
      opts.maxDist !== undefined ? opts.maxDist * opts.maxDist : Infinity;
    Query._each(entities, opts, (id, pos) => {
      const d = (pos.x - x) ** 2 + (pos.y - y) ** 2;
      if (d > bestDist && d <= maxDistSq) {
        bestDist = d;
        bestId = id;
      }
    });
    return bestId;
  },

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

  /**
   * Visit the candidate set as `(id, pos)`. `has`/`hasCollision` JOIN the query instead of
   * filtering after it, and the marker leads the token list so the scan gates on the RAREST
   * column first — finding the one NPC among 475 entities stops costing a `has` per entity
   * (docs/PERF.md).
   */
  _each(entities, opts, fn) {
    const extra = opts.has;
    const wantCollision = opts.hasCollision === true;
    if (extra !== undefined) {
      if (wantCollision)
        entities.forEach([extra, Position, Collision], (id, _e, pos) =>
          fn(id, pos),
        );
      else entities.forEach([extra, Position], (id, _e, pos) => fn(id, pos));
      return;
    }
    if (wantCollision) {
      entities.forEach([Collision, Position], (id, _c, pos) => fn(id, pos));
      return;
    }
    entities.forEach([Position], (id, pos) => fn(id, pos));
  },
};
