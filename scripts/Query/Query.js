// Spatial lookup over entities with a Position. Point-vs-Position tests only (it does not read
// BBox — that's AABB's job); all four queries share the `opts` filter below.
/** @typedef {Object} QueryOpts @property {string} [tag] require this Tag @property {number} [maxDist] cap search radius (world px) @property {boolean} [hasCollision] require a Collision component */
globalThis.Query = class Query {
  /**
   * Nearest matching entity to (x, y), or -1.
   * @param {World} world @param {number} x @param {number} y @param {QueryOpts} [opts]
   * @returns {number} entity id, or -1
   */
  static nearest(world, x, y, opts = {}) {
    let bestId = -1;
    let bestDist =
      opts.maxDist !== undefined ? opts.maxDist * opts.maxDist : Infinity;
    for (const id of world.query(Position)) {
      if (!Query._matchesOpts(world, id, opts)) continue;
      const pos = world.get(Position, id);
      const d = (pos.x - x) ** 2 + (pos.y - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    }
    return bestId;
  }

  /**
   * Farthest matching entity to (x, y) within `maxDist`, or -1.
   * @param {World} world @param {number} x @param {number} y @param {QueryOpts} [opts]
   * @returns {number} entity id, or -1
   */
  static farthest(world, x, y, opts = {}) {
    let bestId = -1;
    let bestDist = -1;
    const maxDistSq =
      opts.maxDist !== undefined ? opts.maxDist * opts.maxDist : Infinity;
    for (const id of world.query(Position)) {
      if (!Query._matchesOpts(world, id, opts)) continue;
      const pos = world.get(Position, id);
      const d = (pos.x - x) ** 2 + (pos.y - y) ** 2;
      if (d > bestDist && d <= maxDistSq) {
        bestDist = d;
        bestId = id;
      }
    }
    return bestId;
  }

  /**
   * All matching entities whose Position falls within the rect [x1,y1]-[x2,y2] (inclusive).
   * @param {World} world @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 @param {QueryOpts} [opts]
   * @returns {number[]} entity ids
   */
  static inRect(world, x1, y1, x2, y2, opts = {}) {
    const result = [];
    for (const id of world.query(Position)) {
      const pos = world.get(Position, id);
      if (pos.x < x1 || pos.x > x2 || pos.y < y1 || pos.y > y2) continue;
      if (!Query._matchesOpts(world, id, opts)) continue;
      result.push(id);
    }
    return result;
  }

  /**
   * All matching entities whose Position is within `radius` of (x, y).
   * @param {World} world @param {number} x @param {number} y @param {number} radius @param {QueryOpts} [opts]
   * @returns {number[]} entity ids
   */
  static inRadius(world, x, y, radius, opts = {}) {
    const result = [];
    const rSq = radius * radius;
    for (const id of world.query(Position)) {
      const pos = world.get(Position, id);
      if ((pos.x - x) ** 2 + (pos.y - y) ** 2 > rSq) continue;
      if (!Query._matchesOpts(world, id, opts)) continue;
      result.push(id);
    }
    return result;
  }

  /** @returns {boolean} whether entity `id` passes the tag / hasCollision filters in `opts`. */
  static _matchesOpts(world, id, opts) {
    if (opts.tag !== undefined) {
      const tag = world.get(Tag, id);
      if (tag === undefined || !tag.tags.has(opts.tag)) return false;
    }
    if (opts.hasCollision) {
      if (world.get(Collision, id) === undefined) return false;
    }
    return true;
  }
};
