// ECS glue over MotionPlanner. flow: add PathRequest → update resolves → current/advance walk waypoints → invalidate on grid change.
globalThis.PathfindingSystem = {
  /** @param {MotionPlanningGrid} grid */
  setGrid(grid) {
    MotionPlanner.setGrid(grid);
  },

  /** drop all responses so stale paths re-plan after a grid change. @param {World} world */
  invalidate(world) {
    for (const id of world.query(PathResponse)) {
      world.detach(id, PathResponse);
    }
  },

  /** @param {World} world */
  update(world) {
    for (const id of world.query(PathRequest)) {
      const req = world.get(PathRequest, id);
      const path = MotionPlanner.plan(
        { x: req.startX, y: req.startY },
        { x: req.goalX, y: req.goalY },
      );
      world.detach(id, PathRequest);
      if (path.length > 0) {
        world.add(id, PathResponse, { path, index: 0 });
      }
    }
  },

  /** @param {World} world @param {number} id @returns {{x:number,y:number}|undefined} */
  current(world, id) {
    const response = world.get(PathResponse, id);
    if (response === undefined) return undefined;
    return response.path[response.index];
  },

  /**
   * advance cursor; returns false and detaches PathResponse when complete.
   * @param {World} world @param {number} id @returns {boolean}
   */
  advance(world, id) {
    const response = world.get(PathResponse, id);
    if (response === undefined) return false;
    const next = response.index + 1;
    if (next >= response.path.length) {
      world.detach(id, PathResponse);
      return false;
    }
    response.index = next;
    return true;
  },
};
