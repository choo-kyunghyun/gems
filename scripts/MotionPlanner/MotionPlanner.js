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
  // per-plan reset by generation: a cell's g/from/closed are live only while `_stamp[i]` equals
  // this plan's `_gen`, so nothing is cleared between plans — a fill over the level is a VM loop
  // even on a typed array, ~10 ms per plan on a 128² level (PERF.md → Measured Costs).
  _stamp: undefined,
  _gen: 0,
  // the open set: a binary min-heap as parallel node/f arrays, reset per plan. In JS rather than
  // ds_priority so a plan holds no GML resource and pays no boundary crossing per op — worth ~5%
  // of a long plan; the expansions themselves are the cost (PERF.md → Known Remaining Costs).
  _hn: [],
  _hf: [],

  setGrid(grid) {
    this.grid = grid;
    const count = grid.size();
    this._g = new Float64Array(count);
    this._from = new Int32Array(count);
    this._closed = new Uint8Array(count);
    this._scratch = new Int32Array(count);
    this._stamp = new Int32Array(count); // zeroed; `_gen` starts above 0 so nothing reads live
  },

  plan(start, goal, algorithm = MP_ALGORITHM.ASTAR, opt = {}) {
    if (this.grid === undefined) return [];
    switch (algorithm) {
      case MP_ALGORITHM.ASTAR:
        return this._astar(start, goal, opt);
      default:
        return [];
    }
  },

  _push(n, f) {
    const hn = this._hn;
    const hf = this._hf;
    let i = hn.length;
    hn.push(n);
    hf.push(f);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hf[p] <= f) break;
      hn[i] = hn[p];
      hf[i] = hf[p];
      i = p;
    }
    hn[i] = n;
    hf[i] = f;
  },

  /** min-f node; the caller checks the heap is non-empty */
  _pop() {
    const hn = this._hn;
    const hf = this._hf;
    const top = hn[0];
    const last = hn.length - 1;
    const n = hn[last];
    const f = hf[last];
    hn.length = last;
    hf.length = last;
    if (last > 0) {
      let i = 0;
      while (true) {
        const l = 2 * i + 1;
        if (l >= last) break;
        const r = l + 1;
        let c = l;
        if (r < last) if (hf[r] < hf[l]) c = r;
        if (hf[c] >= f) break;
        hn[i] = hn[c];
        hf[i] = hf[c];
        i = c;
      }
      hn[i] = n;
      hf[i] = f;
    }
    return top;
  },

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

  _heuristic(x0, y0, x1, y1, allowDiag) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    if (allowDiag) {
      return dx + dy + (MotionPlanner.SQRT_2 - 2) * Math.min(dx, dy);
    }
    return dx + dy;
  },

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

    const g = this._g;
    const from = this._from;
    const closed = this._closed;
    const stamp = this._stamp;
    const gen = ++this._gen;
    this._hn.length = 0;
    this._hf.length = 0;

    stamp[startIdx] = gen;
    g[startIdx] = 0;
    from[startIdx] = -1;
    closed[startIdx] = 0;
    this._push(
      startIdx,
      this._heuristic(sx, sy, gx, gy, allowDiag) * heuristicWeight,
    );

    const dirs = allowDiag
      ? MotionPlanner.DIRS_OCTILE
      : MotionPlanner.DIRS_CARDINAL;
    let iter = 0;

    while (this._hn.length > 0) {
      if (++iter > maxIter) break;

      const node = this._pop();
      if (closed[node]) continue; // pushed ⇒ stamped this plan, so closed is live
      closed[node] = 1;

      if (node === goalIdx) return this._reconstructPath(startIdx, goalIdx);

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
        // nested, not `touched && …`: the short-circuit corrupts its left operand (GMRT.md #15549)
        const touched = stamp[ni] === gen;
        if (touched) if (closed[ni]) continue;

        const tg = g[node] + cellCost * step_dist;
        if (touched) if (tg >= g[ni]) continue;

        if (!touched) {
          stamp[ni] = gen;
          closed[ni] = 0;
        }
        from[ni] = node;
        g[ni] = tg;
        this._push(
          ni,
          tg + this._heuristic(nx, ny, gx, gy, allowDiag) * heuristicWeight,
        );
      }
    }

    return [];
  },
};
