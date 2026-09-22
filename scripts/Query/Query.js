// Spatial lookup over entities with Position. Point tests only (no BBox — that's AABB's job).
/** @typedef {Object} QueryOpts @property {string} [has] require this component (its token) */
globalThis.Query = {
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
};
