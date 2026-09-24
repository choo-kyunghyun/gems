/**
 * The one path walker and terrain cost rule: walks an entity's path response (throttled replan,
 * waypoint cursor) to the movement point each tick, and scales speed by 1/cost of the ground
 * underfoot. The cost is the grid's own, handed in by the caller, so this knows no map specifics.
 */
globalThis.PathFollow = {
  // cost at or above this moves at 1/maxCost, so a mover on a blocked sliver crawls out instead
  // of stranding
  maxCost: 4,

  /** Terrain cost under a world point: at least 1, Infinity allowed, 1 without a grid. */
  costAt(grid, wx, wy) {
    if (grid === null || grid === undefined) return 1;
    const c = grid.costAt(
      Math.floor(wx / grid.cellWidth),
      Math.floor(wy / grid.cellHeight),
    );
    return c >= 1 ? c : 1;
  },

  /** Crossing a cost-c cell takes c× longer, so a mover multiplies its speed by 1/c. */
  speedScale(grid, wx, wy) {
    const c = PathFollow.costAt(grid, wx, wy);
    return 1 / (c < PathFollow.maxCost ? c : PathFollow.maxCost);
  },

  /**
   * The mover's movement point this frame while heading for (tx, ty): the current waypoint's cell
   * center, or (tx, ty) itself until a path exists — a request is served a frame or more later.
   * Replans on the throttle of `state`, any bag carrying pathCd/pathRate.
   */
  target(entities, grid, id, state, sp, tx, ty) {
    if (state.pathCd > 0) state.pathCd -= Time.step;
    if (state.pathCd <= 0) {
      const s = grid.worldToGrid(sp.x, sp.y);
      const g = grid.worldToGrid(tx, ty);
      entities.add(
        id,
        PathRequest,
        { startX: s.x, startY: s.y, goalX: g.x, goalY: g.y },
        { mint: true },
      );
      state.pathCd = state.pathRate;
    }
    let wp = PathFollow._current(entities, id);
    if (wp === undefined) return { x: tx, y: ty };
    // skip a waypoint essentially reached, such as the path's first cell, our own
    let ww = grid.gridToWorld(wp.x, wp.y);
    const near = grid.cellWidth * 0.4;
    if ((sp.x - ww.x) ** 2 + (sp.y - ww.y) ** 2 < near * near) {
      PathFollow._advance(entities, id);
      wp = PathFollow._current(entities, id);
      if (wp === undefined) return { x: tx, y: ty }; // exhausted: close the last stretch
      ww = grid.gridToWorld(wp.x, wp.y);
    }
    return ww;
  },

  /** The current waypoint in grid coords, or undefined without a path. */
  _current(entities, id) {
    const response = entities.get(id, PathResponse);
    if (response === undefined) return undefined;
    return response.path[response.index];
  },

  /** Step to the next waypoint; a path walked out is detached. Returns whether one is left. */
  _advance(entities, id) {
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

  /** Drop any in-flight path request and response. */

  clear(entities, id) {
    if (entities.has(id, PathResponse))
      entities.detach(id, PathResponse);
    if (entities.has(id, PathRequest))
      entities.detach(id, PathRequest);
  },
};
