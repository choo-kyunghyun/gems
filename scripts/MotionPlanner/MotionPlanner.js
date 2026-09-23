/**
 * Static A* planner over a `Grid` of cell costs (≥ 1 = walkable, weighted; Infinity = blocked).
 * Stateless: `plan` takes a `nav` carrying the `grid` and a `scratch(count)` record for its size,
 * so the level-sized working arrays live with the level and a map switch binds nothing here.
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

  /**
   * The working record a plan reuses. A cell's g/from/closed are live only while its `stamp`
   * equals the plan's `gen`, so nothing is cleared between plans — a level-sized fill is too slow.
   * The open set `hn`/`hf` is a binary min-heap as parallel arrays, in JS so a plan holds no GML
   * resource. `iters` is the expansions the last plan spent. Plain arrays, not typed: a typed read
   * costs far more on this runtime, and the loop is all scratch reads.
   * TODO typed scratch is an option again when `read.typed` reaches `read.array`.
   */
  scratch(count) {
    return {
      g: new Array(count).fill(0),
      from: new Array(count).fill(0),
      closed: new Array(count).fill(0),
      path: new Array(count).fill(0),
      stamp: new Array(count).fill(0), // `gen` starts above 0 so nothing reads live
      gen: 0,
      hn: [],
      hf: [],
      iters: 0,
    };
  },

  /**
   * The cells from `start` to `goal` inclusive, or `[]` when either end is out of bounds or
   * blocked, or the goal is unreachable within `opt.maxIter` expansions. `opt.heuristicWeight`
   * > 1 trades optimality for fewer expansions.
   *
   * The expansion loop is flat on purpose: a call or an object literal costs about a hundred plain
   * reads on this runtime, so accessors, heuristic and heap are inlined. Keep it flat.
   */
  plan(nav, start, goal, opt = {}) {
    const grid = nav.grid;
    const sc = nav.scratch;
    const allowDiag = opt.allowDiag ?? false;
    const cornerCutting = opt.cornerCutting ?? false;
    const heuristicWeight = opt.heuristicWeight ?? 1;
    const maxIter = opt.maxIter ?? 100000;

    const cols = grid.cols;
    const rows = grid.rows;
    const data = grid.data;

    const sx = start.x;
    const sy = start.y;
    const gx = goal.x;
    const gy = goal.y;

    if (sx < 0) return [];
    if (sx >= cols) return [];
    if (sy < 0) return [];
    if (sy >= rows) return [];
    if (gx < 0) return [];
    if (gx >= cols) return [];
    if (gy < 0) return [];
    if (gy >= rows) return [];

    const startIdx = sy * cols + sx;
    const goalIdx = gy * cols + gx;
    if (data[startIdx] === Infinity) return [];
    if (data[goalIdx] === Infinity) return [];
    if (startIdx === goalIdx) return [{ x: sx, y: sy }];

    const g = sc.g;
    const from = sc.from;
    const closed = sc.closed;
    const stamp = sc.stamp;
    const gen = ++sc.gen;
    const hn = sc.hn;
    const hf = sc.hf;
    let hlen = 0; // a local, so a push is not an array-length call

    // octile's diagonal discount folds to 0 for cardinal, so one heuristic serves both.
    // BUG: [#15549] `?:`, never a bare variable as a `&&` left operand (docs/GMRT.md).
    const diagK = allowDiag ? MotionPlanner.SQRT_2 - 2 : 0;
    const checkCorner = allowDiag ? (cornerCutting ? 0 : 1) : 0;

    stamp[startIdx] = gen;
    g[startIdx] = 0;
    from[startIdx] = -1;
    closed[startIdx] = 0;
    {
      const adx = gx > sx ? gx - sx : sx - gx;
      const ady = gy > sy ? gy - sy : sy - gy;
      hn[0] = startIdx;
      hf[0] = (adx + ady + diagK * (adx < ady ? adx : ady)) * heuristicWeight;
      hlen = 1;
    }

    const dirs = allowDiag
      ? MotionPlanner.DIRS_OCTILE
      : MotionPlanner.DIRS_CARDINAL;
    const dlen = dirs.length;
    let iter = 0;

    while (hlen > 0) {
      if (++iter > maxIter) break;

      const node = hn[0];
      const last = --hlen;
      if (last > 0) {
        const ln = hn[last];
        const lf = hf[last];
        let i = 0;
        while (true) {
          const l = 2 * i + 1;
          if (l >= last) break;
          let c = l;
          const r = l + 1;
          if (r < last) if (hf[r] < hf[l]) c = r;
          if (hf[c] >= lf) break;
          hn[i] = hn[c];
          hf[i] = hf[c];
          i = c;
        }
        hn[i] = ln;
        hf[i] = lf;
      }

      if (closed[node] === 1) continue; // pushed implies stamped this plan, so closed is live
      closed[node] = 1;

      if (node === goalIdx) {
        sc.iters = iter;
        return MotionPlanner._reconstructPath(sc, cols, startIdx, goalIdx);
      }

      const node_x = node % cols;
      const node_y = (node - node_x) / cols;
      const gnode = g[node];
      const rowBase = node_y * cols;

      for (let i = 0; i < dlen; i += 3) {
        const dx = dirs[i];
        const dy = dirs[i + 1];

        const nx = node_x + dx;
        if (nx < 0) continue;
        if (nx >= cols) continue;
        const ny = node_y + dy;
        if (ny < 0) continue;
        if (ny >= rows) continue;

        const ni = ny * cols + nx;
        const cellCost = data[ni];
        if (cellCost === Infinity) continue;

        if (checkCorner === 1)
          if (dx !== 0)
            if (dy !== 0) {
              if (data[rowBase + nx] === Infinity) continue;
              if (data[ni - dx] === Infinity) continue;
            }

        // BUG: [#15549] nested, not `touched && …` (docs/GMRT.md).
        const touched = stamp[ni] === gen;
        if (touched) if (closed[ni] === 1) continue;

        const tg = gnode + cellCost * dirs[i + 2];
        if (touched) if (tg >= g[ni]) continue;

        if (!touched) {
          stamp[ni] = gen;
          closed[ni] = 0;
        }
        from[ni] = node;
        g[ni] = tg;

        const adx = gx > nx ? gx - nx : nx - gx;
        const ady = gy > ny ? gy - ny : ny - gy;
        const f =
          tg + (adx + ady + diagK * (adx < ady ? adx : ady)) * heuristicWeight;
        let h = hlen++;
        while (h > 0) {
          const par = (h - 1) >> 1;
          if (hf[par] <= f) break;
          hn[h] = hn[par];
          hf[h] = hf[par];
          h = par;
        }
        hn[h] = ni;
        hf[h] = f;
      }
    }

    sc.iters = iter;
    return [];
  },

  _reconstructPath(sc, cols, startIdx, goalIdx) {
    const scratch = sc.path;
    const from = sc.from;
    let len = 0;
    let node = goalIdx;
    while (node !== -1) {
      scratch[len++] = node;
      if (node === startIdx) break;
      node = from[node];
    }

    if (len === 0 || scratch[len - 1] !== startIdx) return [];

    const path = [];
    for (let i = len - 1; i >= 0; i--) {
      const idx = scratch[i];
      const px = idx % cols;
      path.push({ x: px, y: (idx - px) / cols });
    }
    return path;
  },
};
