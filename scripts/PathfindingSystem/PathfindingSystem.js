// Grid wired via MotionPlanner.setGrid (ColonyMap points it at the per-map NavGrid).
globalThis.PathfindingSystem = {
  /** Drop all responses so stale paths re-plan after a grid change. */
  invalidate(entities) {
    for (const id of entities.query(PathResponse)) {
      entities.detach(id, PathResponse);
    }
  },

  update(entities) {
    for (const id of entities.query(PathRequest)) {
      const req = entities.get(PathRequest, id);
      const path = MotionPlanner.plan(
        { x: req.startX, y: req.startY },
        { x: req.goalX, y: req.goalY },
      );
      entities.detach(id, PathRequest);
      if (path.length > 0) {
        entities.add(id, PathResponse, { path, index: 0 });
      }
    }
  },

  current(entities, id) {
    const response = entities.get(PathResponse, id);
    if (response === undefined) return undefined;
    return response.path[response.index];
  },

  advance(entities, id) {
    const response = entities.get(PathResponse, id);
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
