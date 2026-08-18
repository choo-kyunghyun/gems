// Spatial lookup over entities with Position. Point tests only (no BBox — that's AABB's job).
/** @typedef {Object} QueryOpts @property {string} [has] require this component (its token) @property {number} [maxDist] cap search radius (world px) @property {boolean} [hasCollision] require a Collision component */
globalThis.Query = {
  nearest(entities, x, y, opts = {}) {
    let bestId = -1;
    let bestDist =
      opts.maxDist !== undefined ? opts.maxDist * opts.maxDist : Infinity;
    for (const id of entities.query(Position)) {
      if (!Query._matchesOpts(entities, id, opts)) continue;
      const pos = entities.get(id, Position);
      const d = (pos.x - x) ** 2 + (pos.y - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    }
    return bestId;
  },

  farthest(entities, x, y, opts = {}) {
    let bestId = -1;
    let bestDist = -1;
    const maxDistSq =
      opts.maxDist !== undefined ? opts.maxDist * opts.maxDist : Infinity;
    for (const id of entities.query(Position)) {
      if (!Query._matchesOpts(entities, id, opts)) continue;
      const pos = entities.get(id, Position);
      const d = (pos.x - x) ** 2 + (pos.y - y) ** 2;
      if (d > bestDist && d <= maxDistSq) {
        bestDist = d;
        bestId = id;
      }
    }
    return bestId;
  },

  inRect(entities, x1, y1, x2, y2, opts = {}) {
    const result = [];
    for (const id of entities.query(Position)) {
      const pos = entities.get(id, Position);
      if (pos.x < x1 || pos.x > x2 || pos.y < y1 || pos.y > y2) continue;
      if (!Query._matchesOpts(entities, id, opts)) continue;
      result.push(id);
    }
    return result;
  },

  inRadius(entities, x, y, radius, opts = {}) {
    const result = [];
    const rSq = radius * radius;
    for (const id of entities.query(Position)) {
      const pos = entities.get(id, Position);
      if ((pos.x - x) ** 2 + (pos.y - y) ** 2 > rSq) continue;
      if (!Query._matchesOpts(entities, id, opts)) continue;
      result.push(id);
    }
    return result;
  },

  _matchesOpts(entities, id, opts) {
    if (opts.has !== undefined) {
      if (entities.get(id, opts.has) === undefined) return false;
    }
    if (opts.hasCollision) {
      if (entities.get(id, Collision) === undefined) return false;
    }
    return true;
  },
};
