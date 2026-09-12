// Grid wired via MotionPlanner.setGrid (ColonyMap points it at the per-map NavGrid's grid).
/**
 * Serves `PathRequest`s into `PathResponse`s over `MotionPlanner`, at most `budget` per tick — the
 * rest stay pending for later ticks, taken round-robin by POSITION in the request walk from where
 * the last tick stopped, so a sustained overload starves no requester: a served request's slot is
 * refilled from the walk's tail (ComponentStore's order contract), so a pending request only ever
 * moves toward the front and the forward sweep reaches it within two passes. A pending request its
 * walker refreshes first (`PathFollow.target`'s throttle) is replaced in place. A count bound is
 * not a time bound: one far plan still costs what docs/TODO.md → Pathfinding says.
 */
globalThis.PathfindingSystem = {
  budget: 4, // requests served per tick; the overflow carries over
  _cursor: 0, // walk position the next tick's sweep resumes from

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
    let pos = 0; // the walk's position
    let next = cursor;
    entities.forEach([PathRequest], (id, req) => {
      const at = pos++;
      if (served >= budget) return;
      if (at < cursor) {
        skipped++;
        return;
      }
      PathfindingSystem._serve(entities, id, req);
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
          PathfindingSystem._serve(entities, id, req);
          served++;
          next = at + 1;
        });
      }
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
