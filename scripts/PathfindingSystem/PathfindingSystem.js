// Grid wired via MotionPlanner.setGrid (ColonyMap points it at the per-map NavGrid's grid).
/**
 * Serves `PathRequest`s into `PathResponse`s over `MotionPlanner`, at most `budget` per tick — the
 * rest stay pending for later ticks, taken round-robin by entity index from where the last tick
 * stopped, so a sustained overload starves no requester. A pending request its walker refreshes
 * first (`PathFollow.target`'s throttle) is replaced in place. A count bound is not a time bound:
 * one far plan still costs what PERF.md → Known Remaining Costs says.
 */
globalThis.PathfindingSystem = {
  budget: 4, // requests served per tick; the overflow carries over
  _cursor: 0, // entity index the next tick's scan resumes from

  /** Drop all responses so stale paths re-plan after a grid change. */
  invalidate(entities) {
    entities.forEach([PathResponse], (id) => {
      entities.detach(id, PathResponse);
    });
  },

  update(entities) {
    const budget = PathfindingSystem.budget;
    const cursor = PathfindingSystem._cursor;
    let served = 0;
    let skipped = 0; // pending below the cursor, left to the wrap pass
    let next = cursor;
    entities.forEach([PathRequest], (id, req) => {
      if (served >= budget) return;
      const index = EntityID.index(id);
      if (index < cursor) {
        skipped++;
        return;
      }
      PathfindingSystem._serve(entities, id, req);
      served++;
      next = index + 1;
    });
    // budget left ⇒ everything at/after the cursor was served; wrap to what was skipped
    if (served < budget)
      if (skipped > 0)
        entities.forEach([PathRequest], (id, req) => {
          if (served >= budget) return;
          PathfindingSystem._serve(entities, id, req);
          served++;
          next = EntityID.index(id) + 1;
        });
    PathfindingSystem._cursor = next;
  },

  _serve(entities, id, req) {
    const path = MotionPlanner.plan(
      { x: req.startX, y: req.startY },
      { x: req.goalX, y: req.goalY },
    );
    entities.detach(id, PathRequest);
    if (path.length > 0) {
      entities.add(id, PathResponse, { path, index: 0 });
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
