/**
 * Serves path requests into path responses over the level's nav grid, seeded from the level's
 * grid on first read (a level with no grid throws — a wiring error). Each tick first brings the
 * grid current; when the solid kinematic colliders changed, every held response is dropped, since
 * a new wall may cut one, and the walkers re-request on their own throttle.
 *
 * At most `budget` requests are served per tick, round-robin by position in the request walk
 * from where the last tick stopped, so a sustained overload starves no requester. A count bound
 * is not a time bound: one map-crossing plan alone runs over a frame.
 */
globalThis.PathfindingSystem = {
  KEY: "nav", // the derived token on the level's own entity
  budget: 4, // requests served per tick; the overflow carries over

  /** The level's NavGrid, seeded from its grid on the first read. */
  nav(level) {
    return level.entities.derive(level.self, PathfindingSystem.KEY, () => {
      if (level.grid === null)
        throw new Error(
          `PathfindingSystem: level "${level.id}" has no grid to plan over`,
        );
      return new NavGrid(level.grid);
    });
  },

  /** The solid kinematics' rects, fresh, as the nav grid keeps the array by reference. */
  _statics(entities) {
    const statics = [];
    entities.forEach([Collision, Position, BBox], (id, col, pos, box) => {
      if (col.kinematic !== true) return;
      if (!col.solid) return;
      statics.push(AABB.at(pos, box, AABB.rect()));
    });
    return statics;
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
    const gen = PuppetSystem.colliders(level).gen;
    if (gen !== nav.gen) {
      nav.stamp(PathfindingSystem._statics(entities), gen);
      PathfindingSystem._invalidate(entities);
    }
    const budget = PathfindingSystem.budget;
    const cursor = nav.cursor;
    let served = 0;
    let skipped = 0; // pending below the cursor, left to the wrap pass
    let pos = 0;
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
    // budget left means everything from the cursor on was served, so wrap to what was skipped;
    // the served slots are compacted away by now, so the second walk's positions are fresh

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
    const nav = level.entities.get(level.self, PathfindingSystem.KEY);
    const entities = level.entities;
    const path = MotionPlanner.plan(
      nav,
      { x: req.startX, y: req.startY },
      { x: req.goalX, y: req.goalY },
    );
    entities.detach(id, PathRequest);
    if (path.length > 0) {
      entities.add(id, PathResponse, { path }, { mint: true });
    }
  },
};
