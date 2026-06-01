globalThis.Query = class Query {
  static nearest(world, x, y, opts = {}) {
    let bestId = -1;
    let bestDist = opts.maxDist !== undefined ? opts.maxDist * opts.maxDist : Infinity;
    for (const id of world.query(Position)) {
      if (!Query._matchesOpts(world, id, opts)) continue;
      const pos = world.get(Position, id);
      const d = (pos.x - x) ** 2 + (pos.y - y) ** 2;
      if (d < bestDist) { bestDist = d; bestId = id; }
    }
    return bestId;
  }

  static farthest(world, x, y, opts = {}) {
    let bestId = -1;
    let bestDist = -1;
    const maxDistSq = opts.maxDist !== undefined ? opts.maxDist * opts.maxDist : Infinity;
    for (const id of world.query(Position)) {
      if (!Query._matchesOpts(world, id, opts)) continue;
      const pos = world.get(Position, id);
      const d = (pos.x - x) ** 2 + (pos.y - y) ** 2;
      if (d > bestDist && d <= maxDistSq) { bestDist = d; bestId = id; }
    }
    return bestId;
  }

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
