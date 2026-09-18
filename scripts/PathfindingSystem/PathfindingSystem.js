/**
 * Plans over the level's NavGrid — its entry in the level's cache (`nav`), seeded on the first
 * read from the level's grid (a level with no grid has nowhere to plan and throws — a wiring
 * error). Every tick `update` keeps the grid current first: the tile costs through `sync`
 * (a no-op while the layers' edit count holds) and the kinematic solids through `stamp`, off
 * the snapshot SolidSystem keeps — restamped only when its generation moved (a wall built or
 * torn down; a body spawn moves nothing), and then every held `PathResponse` is dropped, since
 * a new wall may cut one (the walkers re-request on their own throttle). The snapshot is the
 * last collider walk's, so a wall raised after this tick's SolidSystem.update lands one tick on.
 *
 * Serves `PathRequest`s into `PathResponse`s over `MotionPlanner`, at most `budget` per tick — the
 * rest stay pending for later ticks, taken round-robin by POSITION in the request walk from where
 * the last tick stopped (`nav.cursor`), so a sustained overload starves no requester: a served
 * request's slot is refilled from the walk's tail (ComponentStore's order contract), so a pending
 * request only ever moves toward the front and the forward sweep reaches it within two passes. A
 * pending request its walker refreshes first (`PathFollow.target`'s throttle) is replaced in
 * place. A count bound is not a time bound: a map-crossing plan runs tens of milliseconds on its
 * own, so serving one is over a frame whatever the budget — testCore `perf.plan` is what that
 * costs.
 */
globalThis.PathfindingSystem = {
  KEY: "nav", // its Level.cache key — the level's NavGrid
  budget: 4, // requests served per tick; the overflow carries over

  /** The level's NavGrid, seeded from its grid on the first read. */
  nav(level) {
    return level.cache.of(PathfindingSystem, () => {
      if (level.grid === null)
        throw new Error(
          `PathfindingSystem: level "${level.id}" has no grid to plan over`,
        );
      return new NavGrid(level.grid);
    });
  },

  /** Drop every response so the walkers re-plan over the changed grid. */
  _invalidate(entities) {
    entities.forEach([PathResponse], (id) => {
      entities.detach(id, PathResponse);
    });
  },

  update(level) {
    const entities = level.entities;
    const nav = PathfindingSystem.nav(level);
    nav.sync();
    if (nav.stamp(SolidSystem.statics(level), SolidSystem.generation(level)))
      PathfindingSystem._invalidate(entities);
    const budget = PathfindingSystem.budget;
    const cursor = nav.cursor;
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
    nav.cursor = next;
  },

  _serve(level, id, req) {
    const nav = level.cache.get(PathfindingSystem);
    const entities = level.entities;
    const path = MotionPlanner.plan(
      nav,
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
