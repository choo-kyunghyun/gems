global.MotionPlanning = class MotionPlanning {
  constructor(grid = undefined) {
    this.planner = new MotionPlanner(grid);
    this.requests = {};
    this.version = 0;
  }

  set_grid(grid) {
    this.planner.set_grid(grid);
    this.requests = {};
  }

  reset(grid = undefined) {
    this.planner.set_grid(grid);
    this.requests = {};
    this.version = 0;
  }

  get_version() {
    return this.version;
  }

  increase_version() {
    this.version++;
    return this.version;
  }

  request_path(actor_id, start, goal, opt = {}) {
    const path = this.planner.plan(start, goal, global.MP_ALGORITHM.ASTAR, opt);
    const request = {
      start: start,
      goal: goal,
      path: path,
      index: 0,
      version: this.version,
    };
    this.requests[actor_id] = request;
    return request;
  }

  get_request(actor_id) {
    return this.requests[actor_id];
  }

  count_requests() {
    return Object.keys(this.requests).length;
  }

  needs_replan(actor_id) {
    const req = this.get_request(actor_id);
    if (typeof req !== "object") return true;
    if (req.path.length === 0) return true;
    return req.version !== this.version;
  }

  remove_request(actor_id) {
    delete this.requests[actor_id];
  }

  get_next_cell(actor_id, consume = false) {
    const req = this.get_request(actor_id);
    if (req === undefined) return undefined;
    const path = req.path;
    const index = req.index;
    const len = path.length;
    if (index >= len) {
      this.remove_request(actor_id);
      return undefined;
    }
    const cell = path[index];
    if (consume) {
      req.index = index + 1;
      if (req.index >= len) this.remove_request(actor_id);
    }
    return cell;
  }
};
