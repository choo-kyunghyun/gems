/**
 * Spatial lookup over entities. Two families: `inRect`/`inRadius` test a POSITION — any entity,
 * a plant or a beacon included, the JS walk — and `maskRect`/`maskRadius` ask the runtime for
 * the colliders whose MASK overlaps the shape (the mirrors, PuppetSystem — a solid collider
 * only, since a solid-off one wears the empty mask), so a body whose centre lies outside but
 * whose box reaches in counts. Both return ids; `has` narrows to a component's carriers.
 * @typedef {Object} QueryOpts @property {string} [has] require this component (its token)
 */
globalThis.Query = {
  _list: -1, // the runtime's hit list, made on first use and kept for the run

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
    const list = Query._ready();
    const found = Puppets.probe().collision_rectangle_list(x1, y1, x2, y2, Puppet, false, true, list, false);
    return Query._ids(entities, list, found, opts.has);
  },

  /** The solid colliders whose mask overlaps the circle. */
  maskRadius(entities, x, y, radius, opts = {}) {
    const list = Query._ready();
    const found = Puppets.probe().collision_circle_list(x, y, radius, Puppet, false, true, list, false);
    return Query._ids(entities, list, found, opts.has);
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

  _ready() {
    if (Query._list === -1) Query._list = ds_list_create();
    ds_list_clear(Query._list);
    return Query._list;
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
};
