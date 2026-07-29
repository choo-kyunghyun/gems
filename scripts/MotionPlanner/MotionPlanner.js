// TODO: mp_linear_step

/** @enum {number} planning algorithm selector for `MotionPlanner.plan`. */
globalThis.MP_ALGORITHM = Object.freeze({
  ASTAR: 0,
});

/**
 * Static A* planner over a `MotionPlanningGrid` (cost Infinity = blocked). `setGrid` allocates
 * reusable scratch arrays once per grid; `plan` reuses them. Consumer: `PathfindingSystem`.
 */
globalThis.MotionPlanner = {
  SQRT_2: Math.sqrt(2),
  DIRS_CARDINAL: [1, 0, 1, -1, 0, 1, 0, 1, 1, 0, -1, 1],
  DIRS_OCTILE: [
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
    Math.sqrt(2),
    1,
    -1,
    Math.sqrt(2),
    -1,
    1,
    Math.sqrt(2),
    -1,
    -1,
    Math.sqrt(2),
  ],

  grid: undefined,
  _g: undefined,
  _from: undefined,
  _closed: undefined,
  _scratch: undefined,

  /** Bind the grid to plan over and (re)allocate scratch arrays sized to it. @param {MotionPlanningGrid} grid */
  setGrid(grid) {
    this.grid = grid;
    const count = grid.size();
    this._g = new Array(count);
    this._from = new Int32Array(count);
    this._closed = new Uint8Array(count);
    this._scratch = new Int32Array(count);
  },

  /**
   * Plan a path between two cells.
   * @param {{x:number,y:number}} start
   * @param {{x:number,y:number}} goal
   * @param {number} [algorithm] an `MP_ALGORITHM` value (default ASTAR)
   * @param {{allowDiag?:boolean,cornerCutting?:boolean,heuristicWeight?:number,maxIter?:number}} [opt]
   * @returns {{x:number,y:number}[]} cell waypoints start→goal, or `[]` if unreachable / no grid.
   */
  plan(start, goal, algorithm = MP_ALGORITHM.ASTAR, opt = {}) {
    if (this.grid === undefined) return [];
    switch (algorithm) {
      case MP_ALGORITHM.ASTAR:
        return this._astar(start, goal, opt);
      default:
        return [];
    }
  },

  /**
   * @param {number} startIdx
   * @param {number} goalIdx
   * @returns {{x:number,y:number}[]}
   */
  _reconstructPath(startIdx, goalIdx) {
    let len = 0;
    let node = goalIdx;
    while (node !== -1) {
      this._scratch[len++] = node;
      if (node === startIdx) break;
      node = this._from[node];
    }

    if (len === 0 || this._scratch[len - 1] !== startIdx) return [];

    const path = [];
    for (let i = len - 1; i >= 0; i--) {
      path.push(this.grid.toPosition(this._scratch[i]));
    }
    return path;
  },

  /**
   * @param {number} x0
   * @param {number} y0
   * @param {number} x1
   * @param {number} y1
   * @param {boolean} allowDiag
   * @returns {number}
   */
  _heuristic(x0, y0, x1, y1, allowDiag) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    if (allowDiag) {
      return dx + dy + (MotionPlanner.SQRT_2 - 2) * Math.min(dx, dy);
    }
    return dx + dy;
  },

  /**
   * @param {{x:number,y:number}} start
   * @param {{x:number,y:number}} goal
   * @param {{allowDiag?:boolean,cornerCutting?:boolean,heuristicWeight?:number,maxIter?:number}} opt
   * @returns {{x:number,y:number}[]}
   */
  _astar(start, goal, opt) {
    const allowDiag = opt.allowDiag ?? false;
    const cornerCutting = opt.cornerCutting ?? false;
    const heuristicWeight = opt.heuristicWeight ?? 1;
    const maxIter = opt.maxIter ?? 100000;

    const grid = this.grid;
    const sx = start.x;
    const sy = start.y;
    const gx = goal.x;
    const gy = goal.y;

    if (!grid.inBounds(sx, sy) || !grid.inBounds(gx, gy)) return [];
    if (grid.get(sx, sy) === Infinity || grid.get(gx, gy) === Infinity)
      return [];

    const startIdx = grid.toIndex(sx, sy);
    const goalIdx = grid.toIndex(gx, gy);
    if (startIdx === goalIdx) return [{ x: sx, y: sy }];

    this._g.fill(Infinity);
    this._from.fill(-1);
    this._closed.fill(0);

    const g = this._g;
    const from = this._from;
    const closed = this._closed;
    const pq = ds_priority_create();

    g[startIdx] = 0;
    ds_priority_add(
      pq,
      startIdx,
      this._heuristic(sx, sy, gx, gy, allowDiag) * heuristicWeight,
    );

    const dirs = allowDiag
      ? MotionPlanner.DIRS_OCTILE
      : MotionPlanner.DIRS_CARDINAL;
    let iter = 0;

    while (!ds_priority_empty(pq)) {
      if (++iter > maxIter) break;

      const node = ds_priority_delete_min(pq);
      if (closed[node]) continue;
      closed[node] = 1;

      if (node === goalIdx) {
        const path = this._reconstructPath(startIdx, goalIdx);
        ds_priority_destroy(pq);
        return path;
      }

      const xy = grid.toPosition(node);
      const node_x = xy.x;
      const node_y = xy.y;

      for (let i = 0; i < dirs.length; i += 3) {
        const dx = dirs[i];
        const dy = dirs[i + 1];
        const step_dist = dirs[i + 2];

        const nx = node_x + dx;
        const ny = node_y + dy;
        if (!grid.inBounds(nx, ny)) continue;

        const cellCost = grid.get(nx, ny);
        if (cellCost === Infinity) continue;

        if (
          allowDiag &&
          !cornerCutting &&
          dx !== 0 &&
          dy !== 0 &&
          (grid.get(node_x + dx, node_y) === Infinity ||
            grid.get(node_x, node_y + dy) === Infinity)
        ) {
          continue;
        }

        const ni = grid.toIndex(nx, ny);
        if (closed[ni]) continue;

        const tg = g[node] + cellCost * step_dist;
        if (tg >= g[ni]) continue;

        from[ni] = node;
        g[ni] = tg;
        ds_priority_add(
          pq,
          ni,
          tg + this._heuristic(nx, ny, gx, gy, allowDiag) * heuristicWeight,
        );
      }
    }

    ds_priority_destroy(pq);
    return [];
  },
};
