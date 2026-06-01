globalThis.PathfindingSystem = {
  setGrid(grid) {
    MotionPlanner.set(grid);
  },

  invalidate(world) {
    for (const id of world.query(PathResponse)) {
      world.detach(id, PathResponse);
    }
  },

  update(world) {
    for (const id of world.query(PathRequest)) {
      const req = world.get(PathRequest, id);
      const path = MotionPlanner.plan({ x: req.sx, y: req.sy }, { x: req.gx, y: req.gy });
      world.detach(id, PathRequest);
      if (path.length > 0) {
        world.add(id, PathResponse, { path, index: 0 });
      }
    }
  },

  current(world, id) {
    const response = world.get(PathResponse, id);
    if (response === undefined) return undefined;
    return response.path[response.index];
  },

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
