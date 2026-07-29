/**
 * Entity ↔ Zone glue: per-frame enter/exit detection + membership queries.
 * State lives on map._inside (entityId -> zoneId); mark-and-sweep fires onExit
 * when an entity leaves to an empty cell OR is removed / filtered out.
 */
globalThis.ZoneSystem = {
  /**
   * @param {Entity} entities
   * @param {LevelGrid} grid
   * @param {ZoneMap} map
   * @param {{ has?: string, onEnter?: function, onExit?: function }} [opts]
   *   has (a component token) filters tracked entities; callbacks get (entityId, zone).
   */
  update(entities, grid, map, opts = {}) {
    const has = opts.has;
    const onEnter = opts.onEnter;
    const onExit = opts.onExit;
    const inside = map._inside;
    const seen = {};

    entities.forEach([Position], (id) => {
      if (has !== undefined && entities.get(has, id) === undefined) return;
      seen[id] = true;
      const pos = entities.get(Position, id);
      const g = grid.worldToGrid(pos.x, pos.y);
      const cur = map.idAt(g.x, g.y);
      const prev = inside[id] ?? 0;
      if (cur === prev) return;
      if (prev !== 0 && onExit !== undefined) onExit(id, map.zone(prev));
      if (cur !== 0 && onEnter !== undefined) onEnter(id, map.zone(cur));
      if (cur === 0) delete inside[id];
      else inside[id] = cur;
    });

    // sweep entities inside last frame but untracked now (removed / lost Position / filtered out).
    // collect first, then mutate — don't delete while iterating. for...in is GMRT-safe.
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

  /**
   * @param {Entity} entities
   * @param {LevelGrid} grid
   * @param {ZoneMap} map
   * @param {number} id
   * @returns {Zone | undefined}
   */
  zoneOf(entities, grid, map, id) {
    const pos = entities.get(Position, id);
    if (pos === undefined) return undefined;
    const g = grid.worldToGrid(pos.x, pos.y);
    return map.at(g.x, g.y);
  },

  /**
   * @returns {number[]} ids of entities currently inside zone `id`.
   * @param {Entity} entities
   * @param {LevelGrid} grid
   * @param {ZoneMap} map
   * @param {number} id
   * @param {{ has?: string }} [opts]  has = a component token filter
   */
  entitiesIn(entities, grid, map, id, opts = {}) {
    const has = opts.has;
    const out = [];
    entities.forEach([Position], (eid) => {
      if (has !== undefined && entities.get(has, eid) === undefined) return;
      const pos = entities.get(Position, eid);
      const g = grid.worldToGrid(pos.x, pos.y);
      if (map.idAt(g.x, g.y) === id) out.push(eid);
    });
    return out;
  },
};
