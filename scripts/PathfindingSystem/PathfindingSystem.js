/**
 * A* pathfinding glue over the active grid. The flow:
 *   1. add a `PathRequest` (grid coords) to an entity;
 *   2. `update` resolves each request into a `PathResponse { path, index }`;
 *   3. `current`/`advance` walk the waypoints;
 *   4. `invalidate` drops all responses after the grid changes.
 * The plan itself is delegated to `MotionPlanner`; this is the per-entity ECS glue.
 */
globalThis.PathfindingSystem = {
  /** Point the planner at the grid all requests resolve against. @param {MotionPlanningGrid} grid */
  setGrid(grid) {
    MotionPlanner.setGrid(grid);
  },

  /** Detach every PathResponse — call after the grid changes so stale paths re-plan. @param {World} world */
  invalidate(world) {
    for (const id of world.query(PathResponse)) {
      world.detach(id, PathResponse);
    }
  },

  /** Resolve each pending PathRequest into a PathResponse (none if unreachable). @param {World} world */
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

  /** @param {World} world @param {number} id @returns {{x:number,y:number}|undefined} the current waypoint, or undefined when none. */
  current(world, id) {
    const response = world.get(PathResponse, id);
    if (response === undefined) return undefined;
    return response.path[response.index];
  },

  /**
   * Advance the cursor to the next waypoint.
   * @param {World} world @param {number} id
   * @returns {boolean} true if a waypoint remained; false (and detaches the PathResponse) when complete.
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
