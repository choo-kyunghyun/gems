globalThis.PathfindingSystem = class PathfindingSystem {
  static setGrid(grid) {
    MotionPlanner.set(grid);
  }

  static invalidate() {
    PathResponse.data.fill(undefined);
    PathCursor.data.fill(undefined);
  }

  static update() {
    for (let i = 0; i < PathRequest.data.length; i++) {
      const req = PathRequest.data[i];
      if (req === undefined) continue;

      const path = MotionPlanner.plan(
        { x: req.sx, y: req.sy },
        { x: req.gx, y: req.gy },
      );

      PathRequest.data[i] = undefined;
      PathResponse.data[i] = path;
      PathCursor.data[i] = 0;
    }
  }
};
