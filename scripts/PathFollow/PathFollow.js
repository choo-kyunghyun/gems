/**
 * PathfindingSystem owns request→response; this walks a PathResponse (throttled replan, waypoint
 * cursor) and returns the proper movement point each tick, and prices the ground so terrain path cost
 * drains movement: speed × 1/cost (easy ground full speed, rough slower, wading slowest; Infinity
 * never reaches a mover — see speedScale's clamp). Shared by any steering system (AI, followers, the
 * player controller) so there's one path walker and one cost rule. Core: the terrain pricing is
 * the level grid's own cost (LevelGrid.costAt — the topmost layer's TileType, `pathCost: null`
 * read as Infinity), handed in by the caller, so this module knows no map/biome specifics.
 */
globalThis.PathFollow = {
  // Speed clamp: cost at/above this moves at 1/maxCost instead of freezing — a mover whose feet
  // land on a blocked/Infinity sliver (deep-water edge cell) crawls out instead of stranding.
  maxCost: 4,

  /**
   * Terrain cost under a world point (≥ 1; Infinity allowed — speedScale clamps it): the grid's
   * cell cost, or 1 on a level with no grid (every cell costs 1).
   */
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
   * The mover's proper MOVEMENT POINT this frame while heading for (tx, ty): the current A*
   * waypoint's cell center — replanning on `state`'s pathCd/pathRate throttle and advancing the
   * cursor on arrival — or (tx, ty) itself while no path exists (PathfindingSystem serves the
   * request later this frame, or a frame or two on when its budget is full, so the first
   * path is followable from the next frame at the earliest). `state` is any bag carrying
   * pathCd/pathRate (CombatAI's Brain); `sp` the mover's Position.
   */
  target(entities, grid, id, state, sp, tx, ty) {
    if (state.pathCd > 0) state.pathCd -= Time.step;
    if (state.pathCd <= 0) {
      const s = grid.worldToGrid(sp.x, sp.y);
      const g = grid.worldToGrid(tx, ty);
      entities.mint(id, PathRequest, {
        startX: s.x,
        startY: s.y,
        goalX: g.x,
        goalY: g.y,
      });
      state.pathCd = state.pathRate;
    }
    let wp = PathFollow._current(entities, id);
    if (wp === undefined) return { x: tx, y: ty }; // no path yet — head straight for now
    // skip a waypoint we've essentially reached (path's first cell is our own)
    let ww = grid.gridToWorld(wp.x, wp.y);
    const near = grid.cellWidth * 0.4;
    if ((sp.x - ww.x) ** 2 + (sp.y - ww.y) ** 2 < near * near) {
      PathFollow._advance(entities, id);
      wp = PathFollow._current(entities, id);
      if (wp === undefined) return { x: tx, y: ty }; // path exhausted — close the last stretch
      ww = grid.gridToWorld(wp.x, wp.y);
    }
    return ww;
  },

  /** The current waypoint of `id`'s PathResponse (grid coords), or undefined without one. */
  _current(entities, id) {
    const response = entities.get(id, PathResponse);
    if (response === undefined) return undefined;
    return response.path[response.index];
  },

  /** Step the cursor to the next waypoint; a path walked out is detached. Returns whether one is left. */
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

  /** Drop any in-flight path components (LOS cleared mid-chase, or leaving the follow behavior). */
  clear(entities, id) {
    if (entities.has(id, PathResponse))
      entities.detach(id, PathResponse);
    if (entities.has(id, PathRequest))
      entities.detach(id, PathRequest);
  },
};
