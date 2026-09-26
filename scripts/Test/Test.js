/**
 * The test kit: the case contract, the case registry, the collector a case is handed, and the
 * shared fixtures. A case module (`test*`, docs/NAMING.md) registers its cases from its top level
 * (docs/GMRT.md → load order) under one of three tiers, run in tier order:
 *   CHECK  a Core case, referencing Core only so it keeps running with Game deleted
 *   GAME   the pinned runtime's defect under a Game asset's workaround: it passes on the pinned
 *          runtime and flips on the one that fixes the defect, so a flip is a change of runtime,
 *          never a regression
 *   STRESS a level under load for `frames` real frames, asserting what must hold, never a time
 * A case:
 *   { id, frames?, setup(ctx), frame?(ctx, i, t), draw?(ctx, t), verify(ctx, t), teardown?(ctx) }
 * Every miss is one `[CHECK] FAIL <id>` line and every measure one `[BENCH]` line. A case touches
 * nothing but its own ctx, and teardown frees what setup made. A case's id is `<area>.<subject>`.
 */
globalThis.Test = {
  CHECK: 0,
  GAME: 1,
  STRESS: 2,
  _tiers: [[], [], []],

  /** A tier runs in registration (= load) order. */
  register(tier, cases) {
    const list = this._tiers[tier];
    for (let i = 0; i < cases.length; i++) list.push(cases[i]);
  },

  /** Registered cases in run order; `filter` is an id prefix, "" for all. */
  cases(filter) {
    const out = [];
    for (let k = 0; k < this._tiers.length; k++) {
      const list = this._tiers[k];
      for (let i = 0; i < list.length; i++)
        if (list[i].id.startsWith(filter)) out.push(list[i]);
    }
    return out;
  },

  /** A level with its own store. */
  level(cols, rows) {
    const grid = new LevelGrid({ cellWidth: 32, cellHeight: 32, cols, rows });
    const layer = new TileLayer(grid, { emptyCost: 1 });
    grid.insert(layer);
    const level = new Level({ id: "test", grid, capacity: 64 });
    return { level, grid, layer, entities: level.entities };
  },

  /** A kinematic solid box, Position at its top-left: a wall that is an entity. */
  box(entities, x, y, w, h) {
    const id = entities.create();
    entities.add(id, Position, { x: x, y: y });
    entities.add(id, BBox, { width: w, height: h });
    entities.add(id, Collision, { kinematic: true });
    return id;
  },

  /** Built at setup, never at load (docs/GMRT.md → load order). */
  types(ctx) {
    ctx.rock = new TileType({ id: 1, pathCost: null });
    ctx.mud = new TileType({ id: 2, pathCost: 3 });
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
    // what a walk hoists once per tick, read off the store's private set
    const set = s._byToken.get(Position);
    ctx.col = set.column;
    ctx.dense = set.dense;
  },

  /** n deterministic floats in [-2, 2) (docs/GMRT.md → Math.random). */
  vals(n) {
    const vals = new Array(n);
    for (let i = 0; i < n; i++) vals[i] = ((i * 7919) % 400) / 100 - 2;
    return vals;
  },

  /** Baseline of a row that reads nothing but its index. */
  empty(n) {
    return () => {
      let s = 0;
      for (let i = 0; i < n; i++) s += i;
      return s;
    };
  },

  /** Baseline of a row that reads one element and applies an op to it. */
  read(n, arr) {
    return () => {
      let s = 0;
      for (let i = 0; i < n; i++) s += arr[i];
      return s;
    };
  },

  /**
   * Sandboxes the UI's app state, handed back by `uiRestore`: no roots, an idle nav and field
   * focus, the pointer parked off-screen, the pad idle, and a keyboard whose only keys down are
   * `ctx.keys`.
   */
  ui(ctx) {
    ctx.keys = [];
    const saved = {
      roots: UI.roots,
      focused: UINav.focused,
      engaged: UINav.engaged,
      suspended: UINav.suspended,
      claimed: UINav._claimed,
      stickX: UINav._stickX,
      stickY: UINav._stickY,
      active: UIInput.active,
      raw: Time.raw,
      pointer: Input.pointer,
      typed: Input.typed,
      pointerClaimed: Input._pointerClaimed,
      keysClaimed: Input._keysClaimed,
      padClaimed: Input._padClaimed,
      consumedKeys: Input._consumedKeys,
      consumedPad: Input._consumedPad,
      reads: {},
    };
    for (let i = 0; i < _TEST_READS.length; i++)
      saved.reads[_TEST_READS[i]] = Input[_TEST_READS[i]];
    ctx._ui = saved;

    UI.roots = [];
    UINav.reset();
    UIInput.active = null;
    const button = () => ({ pressed: false, released: false, down: false, owner: "" });
    Input.pointer = {
      x: -100000,
      y: -100000,
      moved: false,
      wheel: 0,
      roomX: 0,
      roomY: 0,
      winX: 0,
      winY: 0,
      left: button(),
      right: button(),
      middle: button(),
    };
    Input.typed = "";
    Input._consumedKeys = [];
    Input._consumedPad = [];
    Input.keyPressed = (code) =>
      Input._keysClaimed
        ? false
        : Input._consumedKeys.indexOf(code) !== -1
          ? false
          : ctx.keys.indexOf(code) !== -1;
    Input.keyDown = (code) => (Input._keysClaimed ? false : ctx.keys.indexOf(code) !== -1);
    Input.keyReleased = () => false;
    Input.padPressed = () => false;
    Input.padReleased = () => false;
    Input.padDown = () => false;
    Input.padAxis = () => 0;
    Input.padValue = () => 0;
  },

  /** One sandboxed frame: the claims clear, `keys` go down, then the tree and the nav run. */
  uiFrame(ctx, keys) {
    Input._pointerClaimed = false;
    Input._keysClaimed = false;
    Input._padClaimed = false;
    Input._consumedKeys.length = 0;
    Input._consumedPad.length = 0;
    ctx.keys = keys;
    UI.update();
    UINav.update();
  },

  /** Frees every root left in the sandbox and hands the UI's app state back. */
  uiRestore(ctx) {
    const saved = ctx._ui;
    const roots = UI.roots;
    for (let i = roots.length - 1; i >= 0; i--) roots[i].destroy();
    UI.roots = saved.roots;
    UINav.focused = saved.focused;
    UINav.engaged = saved.engaged;
    UINav.suspended = saved.suspended;
    UINav._claimed = saved.claimed;
    UINav._stickX = saved.stickX;
    UINav._stickY = saved.stickY;
    UIInput.active = saved.active;
    Time.raw = saved.raw;
    Input.pointer = saved.pointer;
    Input.typed = saved.typed;
    Input._pointerClaimed = saved.pointerClaimed;
    Input._keysClaimed = saved.keysClaimed;
    Input._padClaimed = saved.padClaimed;
    Input._consumedKeys = saved.consumedKeys;
    Input._consumedPad = saved.consumedPad;
    for (let i = 0; i < _TEST_READS.length; i++)
      Input[_TEST_READS[i]] = saved.reads[_TEST_READS[i]];
  },

  /**
   * `sample` accumulates one value per frame under an id, reported at the case's end as a
   * distribution, since a scenario's cost is its spread, not a mean.
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
     * Logs the per-op cost of `run` net of `base`, the same loop of n without the op; returns the
     * ns. Every loop reads at the loop-variant index and returns its sink, or the read is hoisted
     * and the figure is nonsense. A figure is a same-run ratio: absolute times drift with machine
     * state, so a before/after is two runs in one session (docs/ARCHITECTURE.md → Hot-path
     * idioms).
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

// the device reads the UI sandbox stands in for
const _TEST_READS = [
  "keyPressed",
  "keyDown",
  "keyReleased",
  "padPressed",
  "padReleased",
  "padDown",
  "padAxis",
  "padValue",
];

/** Wall microseconds. */
function _testTime(fn) {
  const t0 = get_timer();
  fn();
  return get_timer() - t0;
}
