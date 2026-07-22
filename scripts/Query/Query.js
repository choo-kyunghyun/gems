// Spatial lookup over entities with Position. Point tests only (no BBox — that's AABB's job).
/** @typedef {Object} QueryOpts @property {string} [has] require this component (its token) @property {number} [maxDist] cap search radius (world px) @property {boolean} [hasCollision] require a Collision component */
globalThis.Query = {
  /** Nearest match to (x, y), or -1. @param {Entity} entities @param {number} x @param {number} y @param {QueryOpts} [opts] @returns {number} */
  nearest(entities, x, y, opts = {}) {
    let bestId = -1;
    let bestDist =
      opts.maxDist !== undefined ? opts.maxDist * opts.maxDist : Infinity;
    for (const id of entities.query(Position)) {
      if (!Query._matchesOpts(entities, id, opts)) continue;
      const pos = entities.get(Position, id);
      const d = (pos.x - x) ** 2 + (pos.y - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    }
    return bestId;
  },

  /** Farthest match within `maxDist`, or -1. @param {Entity} entities @param {number} x @param {number} y @param {QueryOpts} [opts] @returns {number} */
  farthest(entities, x, y, opts = {}) {
    let bestId = -1;
    let bestDist = -1;
    const maxDistSq =
      opts.maxDist !== undefined ? opts.maxDist * opts.maxDist : Infinity;
    for (const id of entities.query(Position)) {
      if (!Query._matchesOpts(entities, id, opts)) continue;
      const pos = entities.get(Position, id);
      const d = (pos.x - x) ** 2 + (pos.y - y) ** 2;
      if (d > bestDist && d <= maxDistSq) {
        bestDist = d;
        bestId = id;
      }
    }
    return bestId;
  },

  /** Matches within rect [x1,y1]-[x2,y2] (inclusive). @param {Entity} entities @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 @param {QueryOpts} [opts] @returns {number[]} */
  inRect(entities, x1, y1, x2, y2, opts = {}) {
    const result = [];
    for (const id of entities.query(Position)) {
      const pos = entities.get(Position, id);
      if (pos.x < x1 || pos.x > x2 || pos.y < y1 || pos.y > y2) continue;
      if (!Query._matchesOpts(entities, id, opts)) continue;
      result.push(id);
    }
    return result;
  },

  /** Matches within `radius` of (x, y). @param {Entity} entities @param {number} x @param {number} y @param {number} radius @param {QueryOpts} [opts] @returns {number[]} */
  inRadius(entities, x, y, radius, opts = {}) {
    const result = [];
    const rSq = radius * radius;
    for (const id of entities.query(Position)) {
      const pos = entities.get(Position, id);
      if ((pos.x - x) ** 2 + (pos.y - y) ** 2 > rSq) continue;
      if (!Query._matchesOpts(entities, id, opts)) continue;
      result.push(id);
    }
    return result;
  },

  /** @returns {boolean} passes the has / hasCollision filters in `opts` */
  _matchesOpts(entities, id, opts) {
    if (opts.has !== undefined) {
      if (entities.get(opts.has, id) === undefined) return false;
    }
    if (opts.hasCollision) {
      if (entities.get(Collision, id) === undefined) return false;
    }
    return true;
  },
};
