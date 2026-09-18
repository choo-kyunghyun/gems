/**
 * Plans over the level's NavGrid — `level.cache` under KEY, mounted by the level's builder (ColonyMap)
 * — pointing MotionPlanner at its grid whenever the level in hand differs from the one it planned
 * last (the planner's level-sized scratch follows the grid). A request on a level with no nav grid
 * is a wiring error and throws.
 *
 * Serves `PathRequest`s into `PathResponse`s over `MotionPlanner`, at most `budget` per tick — the
 * rest stay pending for later ticks, taken round-robin by POSITION in the request walk from where
 * the last tick stopped, so a sustained overload starves no requester: a served request's slot is
 * refilled from the walk's tail (ComponentStore's order contract), so a pending request only ever
 * moves toward the front and the forward sweep reaches it within two passes. A pending request its
 * walker refreshes first (`PathFollow.target`'s throttle) is replaced in place. A count bound is
 * not a time bound: a map-crossing plan runs tens of milliseconds on its own, so serving one is
 * over a frame whatever the budget — testCore `perf.plan` is what that costs.
 */
globalThis.PathfindingSystem = {
  KEY: "nav", // its Level.cache key — the level's NavGrid
  budget: 4, // requests served per tick; the overflow carries over
  // walk position the next tick's sweep resumes from — a fairness cursor over whichever level
  // update() is stepping, meaningless across a level switch and harmless there (the sweep wraps)
  _cursor: 0,

  /** The level's NavGrid, or undefined when its builder mounted none. */
  nav(level) {
    return level.cache.get(PathfindingSystem);
  },

  /** Drop all responses so stale paths re-plan after a grid change. */
  invalidate(entities) {
    entities.forEach([PathResponse], (id) => {
      entities.detach(id, PathResponse);
    });
  },

  update(level) {
    const entities = level.entities;
    const budget = PathfindingSystem.budget;
    const cursor = PathfindingSystem._cursor;
    let served = 0;
    let skipped = 0; // pending below the cursor, left to the wrap pass
    let pos = 0; // the walk's position
    let next = cursor;
    entities.forEach([PathRequest], (id, req) => {
      const at = pos++;
      if (served >= budget) return;
      if (at < cursor) {
        skipped++;
        return;
      }
      PathfindingSystem._serve(level, id, req);
      served++;
      next = at + 1;
    });
    // budget left ⇒ everything at/after the cursor was served; wrap to what was skipped (the
    // served slots are compacted away by now, so the second walk's positions are the fresh ones)
    if (served < budget)
      if (skipped > 0) {
        pos = 0;
        entities.forEach([PathRequest], (id, req) => {
          const at = pos++;
          if (served >= budget) return;
          PathfindingSystem._serve(level, id, req);
          served++;
          next = at + 1;
        });
      }
    PathfindingSystem._cursor = next;
  },

  _serve(level, id, req) {
    const nav = level.cache.get(PathfindingSystem);
    if (nav === undefined)
      throw new Error(`PathfindingSystem: level "${level.id}" mounts no NavGrid`);
    if (MotionPlanner.grid !== nav.grid) MotionPlanner.setGrid(nav.grid);
    const entities = level.entities;
    const path = MotionPlanner.plan(
      { x: req.startX, y: req.startY },
      { x: req.goalX, y: req.goalY },
    );
    entities.detach(id, PathRequest);
    if (path.length > 0) {
      entities.mint(id, PathResponse, { path, index: 0 });
    }
  },

  current(entities, id) {
    const response = entities.get(id, PathResponse);
    if (response === undefined) return undefined;
    return response.path[response.index];
  },

  advance(entities, id) {
    const response = entities.get(id, PathResponse);
    if (response === undefined) return false;
    const next = response.index + 1;
    if (next >= response.path.length) {
      entities.detach(id, PathResponse);
      return false;
    }
    response.index = next;
    return true;
  },
};
