global.MP_ALGORITHM = Object.freeze({
  ASTAR: 0,
});

global.MotionPlanner = class MotionPlanner {
  static COST_INF = infinity;
  static SQRT_2 = Math.sqrt(2);
  static DIRS_CARDINAL = [1, 0, 1, -1, 0, 1, 0, 1, 1, 0, -1, 1];
  static DIRS_OCTILE = [
    1,
    0,
    1,
    -1,
    0,
    1,
    0,
    1,
    1,
    0,
    -1,
    1,
    1,
    1,
    self.SQRT_2,
    1,
    -1,
    self.SQRT_2,
    -1,
    1,
    self.SQRT_2,
    -1,
    -1,
    self.SQRT_2,
  ];

  constructor(grid) {
    this.grid = grid;
  }

  set_grid(grid) {
    this.grid = grid;
  }

  plan(start, goal, algorithm = global.MP_ALGORITHM.ASTAR, opt = {}) {
    if (this.grid === undefined) return [];
    
    switch (algorithm) {
      case global.MP_ALGORITHM.ASTAR:
        return this.plan_astar(start, goal, opt);
      default:
        return [];
    }
  }

  reconstruct_path(came_from, start_i, goal_i) {
    const indices = [];
    let node = goal_i;
    while (node !== -1) {
      indices.push(node);
      if (node === start_i) break;
      node = came_from[node];
    }

    if (indices.length === 0 || indices[indices.length - 1] !== start_i) {
      return [];
    }

    const path = [];
    [...indices].reverse().forEach((i) => {
      const p = this.grid.to_xy(i);
      path.push(p);
    });
    return path;
  }

  astar_heuristic(x0, y0, x1, y1, allow_diag) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    if (allow_diag) {
      return dx + dy + (MotionPlanner.SQRT_2 - 2) * Math.min(dx, dy);
    }
    return dx + dy;
  }

  plan_astar(start, goal, opt) {
    const allow_diag = opt.allow_diag ?? false;
    const corner_cutting = opt.corner_cutting ?? false;
    const heuristic_weight = opt.heuristic_weight ?? 1;
    const max_iter = opt.max_iter ?? 100000;

    const sx = start.x;
    const sy = start.y;
    const gx = goal.x;
    const gy = goal.y;

    if (!this.grid.in_bounds(sx, sy) || !this.grid.in_bounds(gx, gy)) return [];
    if (this.grid.is_blocked(sx, sy) || this.grid.is_blocked(gx, gy)) return [];

    const start_i = this.grid.to_index(sx, sy);
    const goal_i = this.grid.to_index(gx, gy);
    if (start_i === goal_i) return [{ x: sx, y: sy }];

    const count = this.grid.rows * this.grid.cols;
    const g = Array(count).fill(infinity);
    const came_from = Array(count).fill(-1);
    const closed = Array(count).fill(false);
    const pq = ds_priority_create();

    g[start_i] = 0;
    const h0 = this.astar_heuristic(sx, sy, gx, gy, allow_diag);
    ds_priority_add(pq, start_i, h0 * heuristic_weight);

    const dirs = allow_diag
      ? MotionPlanner.DIRS_OCTILE
      : MotionPlanner.DIRS_CARDINAL;
    let iter = 0;

    while (!ds_priority_empty(pq)) {
      if (++iter > max_iter) break;

      const node = ds_priority_delete_min(pq);
      if (closed[node]) continue;
      closed[node] = true;

      if (node === goal_i) {
        const path = this.reconstruct_path(came_from, start_i, goal_i);
        ds_priority_destroy(pq);
        return path;
      }

      const xy = this.grid.to_xy(node);
      const node_x = xy.x;
      const node_y = xy.y;

      for (let i = 0; i < dirs.length; i += 3) {
        const dx = dirs[i];
        const dy = dirs[i + 1];
        const step_dist = dirs[i + 2];

        const nx = node_x + dx;
        const ny = node_y + dy;
        if (!this.grid.in_bounds(nx, ny)) continue;
        if (this.grid.is_blocked(nx, ny)) continue;

        if (allow_diag && !corner_cutting && dx !== 0 && dy !== 0) {
          if (
            this.grid.is_blocked(node_x + dx, node_y) ||
            this.grid.is_blocked(node_x, node_y + dy)
          ) {
            continue;
          }
        }

        const ni = this.grid.to_index(nx, ny);
        if (closed[ni]) continue;

        const cell_cost = this.grid.get_cost(nx, ny);
        const tentative_g = g[node] + cell_cost * step_dist;
        if (tentative_g >= g[ni]) continue;

        came_from[ni] = node;
        g[ni] = tentative_g;
        const h = this.astar_heuristic(nx, ny, gx, gy, allow_diag);
        const f = tentative_g + h * heuristic_weight;
        ds_priority_add(pq, ni, f);
      }
    }

    ds_priority_destroy(pq);
    return [];
  }
};
