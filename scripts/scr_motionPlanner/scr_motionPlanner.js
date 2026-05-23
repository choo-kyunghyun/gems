globalThis.MP_ALGORITHM = Object.freeze({
  ASTAR: 0,
});

globalThis.MotionPlanner = class MotionPlanner {
  constructor(grid) {
    this.SQRT_2 = Math.sqrt(2);
    this.DIRS_CARDINAL = [1, 0, 1, -1, 0, 1, 0, 1, 1, 0, -1, 1];
    this.DIRS_OCTILE = [
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
      this.SQRT_2,
      1,
      -1,
      this.SQRT_2,
      -1,
      1,
      this.SQRT_2,
      -1,
      -1,
      this.SQRT_2,
    ];
    this.grid = grid;
  }

  set(grid) {
    this.grid = grid;
  }

  plan(start, goal, algorithm = MP_ALGORITHM.ASTAR, opt = {}) {
    if (this.grid === undefined) return [];

    switch (algorithm) {
      case MP_ALGORITHM.ASTAR:
        return this.astar(start, goal, opt);
      default:
        return [];
    }
  }

  _reconstructPath(cameFrom, startIdx, goalIdx) {
    const indices = [];
    let node = goalIdx;
    while (node !== -1) {
      indices.push(node);
      if (node === startIdx) break;
      node = cameFrom[node];
    }

    if (indices.length === 0 || indices[indices.length - 1] !== startIdx) {
      return [];
    }

    const path = [];
    [...indices].reverse().forEach((i) => {
      const p = this.grid.toXy(i);
      path.push(p);
    });
    return path;
  }

  _astarHeuristic(x0, y0, x1, y1, allowDiag) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    if (allowDiag) {
      return dx + dy + (this.SQRT_2 - 2) * Math.min(dx, dy);
    }
    return dx + dy;
  }

  astar(start, goal, opt) {
    const allowDiag = opt.allowDiag ?? false;
    const cornerCutting = opt.cornerCutting ?? false;
    const heuristicWeight = opt.heuristicWeight ?? 1;
    const maxIter = opt.maxIter ?? 100000;

    const sx = start.x;
    const sy = start.y;
    const gx = goal.x;
    const gy = goal.y;

    if (!this.grid.inBounds(sx, sy) || !this.grid.inBounds(gx, gy)) return [];
    if (this.grid.isBlocked(sx, sy) || this.grid.isBlocked(gx, gy)) return [];

    const startIdx = this.grid.toIndex(sx, sy);
    const goalIdx = this.grid.toIndex(gx, gy);
    if (startIdx === goalIdx) return [{ x: sx, y: sy }];

    const count = this.grid.cellCount();
    const g = Array(count).fill(Infinity);
    const cameFrom = Array(count).fill(-1);
    const closed = Array(count).fill(false);
    const pq = ds_priority_create();

    g[startIdx] = 0;
    const h0 = this._astarHeuristic(sx, sy, gx, gy, allowDiag);
    ds_priority_add(pq, startIdx, h0 * heuristicWeight);

    const dirs = allowDiag ? this.DIRS_OCTILE : this.DIRS_CARDINAL;
    let iter = 0;

    while (!ds_priority_empty(pq)) {
      if (++iter > maxIter) break;

      const node = ds_priority_delete_min(pq);
      if (closed[node]) continue;
      closed[node] = true;

      if (node === goalIdx) {
        const path = this._reconstructPath(cameFrom, startIdx, goalIdx);
        ds_priority_destroy(pq);
        return path;
      }

      const xy = this.grid.toXy(node);
      const node_x = xy.x;
      const node_y = xy.y;

      for (let i = 0; i < dirs.length; i += 3) {
        const dx = dirs[i];
        const dy = dirs[i + 1];
        const step_dist = dirs[i + 2];

        const nx = node_x + dx;
        const ny = node_y + dy;
        if (!this.grid.inBounds(nx, ny)) continue;
        if (this.grid.isBlocked(nx, ny)) continue;

        const isDiagonalStep =
          allowDiag && !cornerCutting && dx !== 0 && dy !== 0;
        const isBlockedCorner =
          this.grid.isBlocked(node_x + dx, node_y) ||
          this.grid.isBlocked(node_x, node_y + dy);
        if (isDiagonalStep && isBlockedCorner) {
          continue;
        }

        const ni = this.grid.toIndex(nx, ny);
        if (closed[ni]) continue;

        const cell_cost = this.grid.getCost(nx, ny);
        const tentative_g = g[node] + cell_cost * step_dist;
        if (tentative_g >= g[ni]) continue;

        cameFrom[ni] = node;
        g[ni] = tentative_g;
        const h = this._astarHeuristic(nx, ny, gx, gy, allowDiag);
        const f = tentative_g + h * heuristicWeight;
        ds_priority_add(pq, ni, f);
      }
    }

    ds_priority_destroy(pq);
    return [];
  }
};
