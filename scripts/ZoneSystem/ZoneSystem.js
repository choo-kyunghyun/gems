/**
 * Entity ↔ Zone glue: per-frame enter/exit detection over a ZoneMap plus
 * membership queries. The stateless-object system idiom (like the Core systems),
 * but exposing named methods rather than a World tick. Drive it from a scene's
 * step() to react when entities cross zone borders (events, weather, quests).
 *
 * Enter/exit state is persisted on `map._inside` (entityId -> zoneId) so the same
 * map can be polled every frame; mark-and-sweep fires onExit for entities that
 * left to an empty cell *or* were removed / filtered out entirely.
 */
globalThis.ZoneSystem = {
  /**
   * @param {World} world
   * @param {Level} level   for worldToGrid
   * @param {ZoneMap} map
   * @param {{ tag?: string, onEnter?: function, onExit?: function }} [opts]
   *   tag filters which entities are tracked (by Tag component); callbacks get
   *   (entityId, zone).
   */
  update(world, level, map, opts = {}) {
    const tag = opts.tag;
    const onEnter = opts.onEnter;
    const onExit = opts.onExit;
    const inside = map._inside;
    const seen = {};

    world.forEach([Position], (id) => {
      if (tag !== undefined) {
        const tc = world.get(Tag, id);
        if (tc === undefined || !tc.tags.has(tag)) return;
      }
      seen[id] = true;
      const pos = world.get(Position, id);
      const g = level.worldToGrid(pos.x, pos.y);
      const cur = map.idAt(g.x, g.y);
      const prev = inside[id] ?? 0;
      if (cur === prev) return;
      if (prev !== 0 && onExit !== undefined) onExit(id, map.zone(prev));
      if (cur !== 0 && onEnter !== undefined) onEnter(id, map.zone(cur));
      if (cur === 0) delete inside[id];
      else inside[id] = cur;
    });

    // Sweep entities that were inside last frame but weren't tracked this one
    // (removed / lost Position / no longer match the tag). Collect first, then
    // mutate — don't delete while iterating. for...in over a plain object is
    // GMRT-safe (Map/Set iteration is not).
    const stale = [];
    for (const key in inside) {
      if (seen[key] === undefined) stale.push(key);
    }
    for (let i = 0; i < stale.length; i++) {
      const prev = inside[stale[i]];
      if (prev !== 0 && onExit !== undefined) onExit(+stale[i], map.zone(prev));
      delete inside[stale[i]];
    }
  },

  /** @returns {Zone | undefined} the zone an entity currently stands in. */
  zoneOf(world, level, map, id) {
    const pos = world.get(Position, id);
    if (pos === undefined) return undefined;
    const g = level.worldToGrid(pos.x, pos.y);
    return map.at(g.x, g.y);
  },

  /**
   * @returns {number[]} ids of entities currently inside zone `id`.
   * @param {{ tag?: string }} [opts]
   */
  entitiesIn(world, level, map, id, opts = {}) {
    const tag = opts.tag;
    const out = [];
    world.forEach([Position], (eid) => {
      if (tag !== undefined) {
        const tc = world.get(Tag, eid);
        if (tc === undefined || !tc.tags.has(tag)) return;
      }
      const pos = world.get(Position, eid);
      const g = level.worldToGrid(pos.x, pos.y);
      if (map.idAt(g.x, g.y) === id) out.push(eid);
    });
    return out;
  },
};
