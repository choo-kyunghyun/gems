globalThis.Query = class Query {
  // Returns the entity ID nearest to (x, y), or -1 if none found.
  // opts.tag: only consider entities with this tag
  // opts.maxDist: ignore entities beyond this distance
  static nearest(x, y, opts = {}) {
    let bestId = -1;
    let bestDist = opts.maxDist !== undefined ? opts.maxDist * opts.maxDist : Infinity;
    for (let i = 0; i < Position.data.length; i++) {
      const pos = Position.data[i];
      if (pos === undefined) continue;
      if (!Query._matchesOpts(i, opts)) continue;
      const d = (pos.x - x) ** 2 + (pos.y - y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestId = IdPool.makeId(i, IdPool.generations[i]);
      }
    }
    return bestId;
  }

  // Returns the entity ID farthest from (x, y), or -1 if none found.
  // opts.tag: only consider entities with this tag
  // opts.maxDist: ignore entities beyond this distance
  static farthest(x, y, opts = {}) {
    let bestId = -1;
    let bestDist = -1;
    const maxDistSq = opts.maxDist !== undefined ? opts.maxDist * opts.maxDist : Infinity;
    for (let i = 0; i < Position.data.length; i++) {
      const pos = Position.data[i];
      if (pos === undefined) continue;
      if (!Query._matchesOpts(i, opts)) continue;
      const d = (pos.x - x) ** 2 + (pos.y - y) ** 2;
      if (d > bestDist && d <= maxDistSq) {
        bestDist = d;
        bestId = IdPool.makeId(i, IdPool.generations[i]);
      }
    }
    return bestId;
  }

  // Returns an array of entity IDs whose Position is inside the rectangle.
  // opts.tag: only consider entities with this tag
  static inRect(x1, y1, x2, y2, opts = {}) {
    const result = [];
    for (let i = 0; i < Position.data.length; i++) {
      const pos = Position.data[i];
      if (pos === undefined) continue;
      if (pos.x < x1 || pos.x > x2 || pos.y < y1 || pos.y > y2) continue;
      if (!Query._matchesOpts(i, opts)) continue;
      result.push(IdPool.makeId(i, IdPool.generations[i]));
    }
    return result;
  }

  // Returns an array of entity IDs within radius of (x, y).
  // opts.tag: only consider entities with this tag
  static inRadius(x, y, radius, opts = {}) {
    const result = [];
    const rSq = radius * radius;
    for (let i = 0; i < Position.data.length; i++) {
      const pos = Position.data[i];
      if (pos === undefined) continue;
      if ((pos.x - x) ** 2 + (pos.y - y) ** 2 > rSq) continue;
      if (!Query._matchesOpts(i, opts)) continue;
      result.push(IdPool.makeId(i, IdPool.generations[i]));
    }
    return result;
  }

  static _matchesOpts(i, opts) {
    if (opts.tag !== undefined) {
      const tags = Tag.data[i];
      if (tags === undefined || !tags.has(opts.tag)) return false;
    }
    if (opts.hasCollision) {
      if (Collision.data[i] === undefined) return false;
    }
    return true;
  }
};
