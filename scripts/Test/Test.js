/**
 * The test kit: the case contract, the registry sceneTest drains, the collector a case is
 * handed, and the fixtures the case modules share. A case module (`test*`, NAMING.md) is a list
 * of cases handed to `Test.register` from its top level — `Test` sorts before every `test*`
 * (docs/GMRT.md → load order) — under one of three tiers, run in tier order:
 *   CHECK  a Core case, referencing Core only (it must keep running with Game deleted), the
 *          `perf.*` families included
 *   GAME   what the PINNED runtime does with a Game asset where a doc entry names a defect and
 *          the code carries the workaround: it PASSES on the pinned runtime and FLIPS on the one
 *          that fixes the defect, so a run on a candidate runtime reads the workarounds to retire
 *          as `[CHECK] FAIL` lines, each naming its retirement (TODO.md → Planned, the runtime
 *          upgrade). A flip is a change of runtime, never a regression.
 *   STRESS a scenario: a level under load for `frames` REAL frames, drawn, sampled, asserting
 *          what must HOLD — never a time: a time is a sample, an assertion is a fact
 * A case:
 *   { id, frames?, setup(ctx), frame?(ctx, i, t), draw?(ctx, t), verify(ctx, t), teardown?(ctx) }
 * setup fills ctx (a Level, a store, the ids); verify asserts through t.ok/eq/near — every miss
 * is one `[CHECK] FAIL <id>` line — and times through t.measure, one `[BENCH]` line per measure;
 * teardown frees what setup made. `frames` (default 1) spans a case over real frames for what
 * only a frame boundary can catch, `frame` runs on each and `draw` while the case is live. A
 * case touches nothing but its own ctx — a system's per-level cache lives on the case's Level and
 * goes with it. A case's id is `<area>.<subject>`; `GEMS_TEST=<prefix>` runs the ids under it.
 */
globalThis.Test = {
  CHECK: 0,
  GAME: 1,
  STRESS: 2,
  _tiers: [[], [], []],

  /** Queue `cases` under `tier`; a tier runs in registration (= load) order. */
  register(tier, cases) {
    const list = this._tiers[tier];
    for (let i = 0; i < cases.length; i++) list.push(cases[i]);
  },

  /** Every registered case in run order, `filter` (an id prefix, "" for all) applied. */
  cases(filter) {
    const out = [];
    for (let k = 0; k < this._tiers.length; k++) {
      const list = this._tiers[k];
      for (let i = 0; i < list.length; i++)
        if (list[i].id.startsWith(filter)) out.push(list[i]);
    }
    return out;
  },

  // ── fixtures ────────────────────────────────────────────────────────────────

  /** A 32 px-cell level with one empty-cost-1 tile layer, its own store. */
  level(cols, rows) {
    const grid = new LevelGrid({ cellWidth: 32, cellHeight: 32, cols, rows });
    const layer = new TileLayer(cols, rows, { emptyCost: 1 });
    grid.insert(layer);
    const level = new Level({ id: "test", grid, capacity: 64 });
    return { level, grid, layer, entities: level.entities };
  },

  /** Tile types built at setup, never at load: TileType sorts after Test (docs/GMRT.md → load order). */
  types(ctx) {
    ctx.rock = new TileType({ id: "test_rock", pathCost: null }); // blocking
    ctx.mud = new TileType({ id: "test_mud", pathCost: 3 }); // weighted
  },

  /** A store of `count` entities carrying Position, plus an n-long cycling id list and its data. */
  store(ctx, count, n) {
    const s = new Table(count);
    ctx.entities = s;
    const ids = [];
    for (let i = 0; i < count; i++) {
      const id = s.create();
      s.add(id, Position, { x: i, y: 0, z: 0 });
      ids.push(id);
    }
    ctx.ids = new Array(n);
    ctx.objs = new Array(n);
    for (let i = 0; i < n; i++) {
      const id = ids[i % count];
      ctx.ids[i] = id;
      ctx.objs[i] = s.get(id, Position);
    }
    // the column and dense list a walk hoists once per tick — read off the store's private set
    const set = s.components._byToken.get(Position);
    ctx.col = set.column;
    ctx.dense = set.dense;
  },

  /** n floats in [-2, 2), no shared stream (docs/GMRT.md → Math.random). */
  vals(n) {
    const vals = new Array(n);
    for (let i = 0; i < n; i++) vals[i] = ((i * 7919) % 400) / 100 - 2;
    return vals;
  },

  /** The empty loop of n — the baseline of a row that reads nothing but its index. */
  empty(n) {
    return () => {
      let s = 0;
      for (let i = 0; i < n; i++) s += i;
      return s;
    };
  },

  /** The loop of n reading `arr[i]` — the baseline of a row that reads one element and applies an op to it. */
  read(n, arr) {
    return () => {
      let s = 0;
      for (let i = 0; i < n; i++) s += arr[i];
      return s;
    };
  },

  // ── the collector ───────────────────────────────────────────────────────────

  /**
   * The collector a case is handed: the assertions (each miss is one FAIL line); `measure`; and
   * `sample`, which accumulates one value per frame of a scenario under an id, reported by the
   * runner at the case's end as one `[BENCH] <id> p50 … p95 … max …` line — a distribution,
   * since a scenario's cost is its spread, not a mean.
   */
  collector() {
    const t = { fails: [], _sampleIds: [], _samples: [] };
    t.sample = (id, value) => {
      let k = t._sampleIds.indexOf(id);
      if (k < 0) {
        k = t._sampleIds.length;
        t._sampleIds.push(id);
        t._samples.push([]);
      }
      t._samples[k].push(value);
    };
    t.report = () => {
      for (let k = 0; k < t._sampleIds.length; k++) {
        const v = t._samples[k];
        v.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); // a SIGN comparator (docs/GMRT.md #15593)
        const n = v.length;
        const at = (q) => v[Math.min(n - 1, Math.floor(q * n))];
        Log.info(
          "[BENCH] " +
            t._sampleIds[k] +
            " p50 " +
            at(0.5) +
            " p95 " +
            at(0.95) +
            " max " +
            v[n - 1] +
            " (n=" +
            n +
            ")",
        );
      }
    };
    t.ok = (cond, msg) => {
      if (!cond) t.fails.push(msg);
    };
    t.eq = (actual, expected, msg) => {
      if (actual !== expected)
        t.fails.push(msg + " : " + actual + " expected " + expected);
    };
    t.near = (actual, expected, eps, msg) => {
      if (Math.abs(actual - expected) > eps)
        t.fails.push(msg + " : " + actual + " expected " + expected + " ±" + eps);
    };
    /**
     * Time `run` against `base` — the SAME loop of n without the op — REPEATS times each, keep
     * the minimum of each, and log the difference per op as one `[BENCH]` line (the per-op cost
     * net of the loop); returns the ns.
     *
     * A `perf.*` case is one family of per-op costs — THE record of what an operation costs on
     * the pinned runtime, and the rule each family decides sits on its case. Its rows share the
     * case's setup, every loop reads at the loop-variant index i, and `base` is the same loop
     * minus the op — a loop-invariant read is hoisted and reports sub-nanosecond nonsense. A
     * loop returns its sink so the work is observable. A figure is a same-run ratio: absolute
     * times drift ~30% with machine state, so a before/after is two Reruns in one session, never
     * a figure from an earlier one. The runtime is a VM at ~40-110x V8's per-op cost, which is
     * why per-element constants, not complexity class, decide the frame (docs/ARCHITECTURE.md →
     * Hot-path idioms). On a runtime upgrade re-run the family: a ratio that moved names the
     * TODO at the site citing it (each family's comment says which), and absolute ns/op
     * collapsing toward V8 is a JIT, which makes every hot-path idiom advisory. A per-op claim
     * in a comment is a measure here.
     */
    t.measure = (id, n, base, run) => {
      let b = Infinity;
      let r = Infinity;
      for (let k = 0; k < REPEATS; k++) {
        const tb = _testTime(base);
        if (tb < b) b = tb;
        const tr = _testTime(run);
        if (tr < r) r = tr;
      }
      const ns = Math.round(((r - b) / n) * 10000) / 10; // us → ns, one decimal
      Log.info(
        "[BENCH] " +
          id +
          " " +
          ns +
          " ns/op (n=" +
          n +
          ", base " +
          b +
          " us, run " +
          r +
          " us)",
      );
      return ns;
    };
    return t;
  },
};

const REPEATS = 3; // per measure, base and run each; the minimum of each is what the figure nets

/** Wall microseconds fn takes. */
function _testTime(fn) {
  const t0 = get_timer();
  fn();
  return get_timer() - t0;
}
