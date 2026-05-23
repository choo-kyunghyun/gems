// TODO: Simplify the API
globalThis.MotionPlanning = class MotionPlanning {
  constructor(grid = undefined) {
    this.planner = new MotionPlanner(grid);
    this.requests = {};
    this.version = 0;
  }

  setGrid(grid) {
    this.planner.set(grid);
    this.requests = {};
  }

  reset(grid = undefined) {
    this.planner.set(grid);
    this.requests = {};
    this.version = 0;
  }

  getVersion() {
    return this.version;
  }

  increaseVersion() {
    this.version++;
    return this.version;
  }

  requestPath(id, start, goal, opt = {}) {
    const path = this.planner.plan(start, goal, MP_ALGORITHM.ASTAR, opt);
    const request = {
      start: start,
      goal: goal,
      path: path,
      index: 0,
      version: this.version,
    };
    this.requests[id] = request;
    return request;
  }

  getRequest(id) {
    return this.requests[id];
  }

  countRequests() {
    return Object.keys(this.requests).length;
  }

  needsReplan(id) {
    const req = this.getRequest(id);
    if (typeof req !== "object") return true;
    if (req.path.length === 0) return true;
    return req.version !== this.version;
  }

  removeRequest(id) {
    delete this.requests[id];
  }

  getNextCell(id, consume = false) {
    const req = this.getRequest(id);
    if (req === undefined) return undefined;
    const path = req.path;
    const index = req.index;
    const len = path.length;
    if (index >= len) {
      this.removeRequest(id);
      return undefined;
    }
    const cell = path[index];
    if (consume) {
      req.index = index + 1;
      if (req.index >= len) this.removeRequest(id);
    }
    return cell;
  }
};
