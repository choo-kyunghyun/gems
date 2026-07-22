// Path-following + terrain movement-cost helper — the CONSUMER side of the pathfinding flow.
// PathfindingSystem owns request→response; this walks a PathResponse (throttled replan, waypoint
// cursor) and returns the proper movement point each tick, and prices the ground a mover stands on
// so terrain path cost drains movement: speed × 1/cost (easy ground full speed, rough slower,
// wading slowest; Infinity never reaches a mover — see speedScale's clamp). Extracted from
// CombatAI so any steering system (AI, followers, the player controller) shares one path walker
// and one cost rule. Core: the terrain pricing arrives via an injected provider (bind), so this
// module knows no map/biome specifics.
globalThis.PathFollow = {
  // Injected per-map terrain-cost provider: (wx, wy) → cost (1 = easy, >1 = rough, Infinity =
  // impassable), or null when the map prices no terrain (interiors — every cell costs 1).
  // Rebound on each map activate (RpgMap._activateReset), like CombatAI.bind.
  costProvider: null,
  // Speed clamp: cost at/above this moves at 1/maxCost instead of freezing — a mover whose feet
  // land on a blocked/Infinity sliver (deep-water edge cell) crawls out instead of stranding.
  maxCost: 4,

  bind(provider) {
    this.costProvider = provider ?? null;
  },

  // terrain cost under a world point (≥ 1; Infinity allowed — speedScale clamps it)
  costAt(wx, wy) {
    if (this.costProvider === null) return 1;
    const c = this.costProvider(wx, wy);
    return c >= 1 ? c : 1;
  },

  // Movement-point consumption as a speed factor: crossing a cost-c cell takes c× longer, so a
  // mover multiplies its speed by 1/c — full speed on easy ground, slower on rough, slowest wading.
  speedScale(wx, wy) {
    const c = this.costAt(wx, wy);
    return 1 / (c < this.maxCost ? c : this.maxCost);
  },

  // The mover's proper MOVEMENT POINT this tick while heading for (tx, ty): the current A*
  // waypoint's cell center — replanning on `state`'s pathCd/pathRate throttle and advancing the
  // cursor on arrival — or (tx, ty) itself while no path exists (the request resolves later this
  // tick in PathfindingSystem, so the first path is followable next tick). `state` is any bag
  // carrying pathCd/pathRate (CombatAI's Brain); `sp` the mover's Position.
  target(entities, level, id, state, sp, tx, ty) {
    if (state.pathCd > 0) state.pathCd--;
    if (state.pathCd <= 0) {
      const s = level.worldToGrid(sp.x, sp.y);
      const g = level.worldToGrid(tx, ty);
      entities.add(id, PathRequest, {
        startX: s.x,
        startY: s.y,
        goalX: g.x,
        goalY: g.y,
      });
      state.pathCd = state.pathRate;
    }
    let wp = PathfindingSystem.current(entities, id);
    if (wp === undefined) return { x: tx, y: ty }; // no path yet — head straight for now
    // skip a waypoint we've essentially reached (path's first cell is our own)
    let ww = level.gridToWorld(wp.x, wp.y);
    const near = level.cellWidth * 0.4;
    if ((sp.x - ww.x) ** 2 + (sp.y - ww.y) ** 2 < near * near) {
      PathfindingSystem.advance(entities, id);
      wp = PathfindingSystem.current(entities, id);
      if (wp === undefined) return { x: tx, y: ty }; // path exhausted — close the last stretch
      ww = level.gridToWorld(wp.x, wp.y);
    }
    return ww;
  },

  // drop any in-flight path components (LOS cleared mid-chase, or leaving the follow behavior)
  clear(entities, id) {
    if (entities.get(PathResponse, id) !== undefined)
      entities.detach(id, PathResponse);
    if (entities.get(PathRequest, id) !== undefined)
      entities.detach(id, PathRequest);
  },
};
