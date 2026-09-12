// Core test harness. Runs the testCore cases, then the testStress scenarios, one per Step so the
// window stays live (a scenario spans `frames` Steps and draws its level), and reports
// through game.log lines under a prefix — `[TEST]` the run's banner + summary, `[CHECK]` a case's
// PASS/FAIL, `[BENCH]` a ns/op figure a case measured — so a run is read with a grep and never
// written into the repo. Re-run in the same session for a before/after: a timing compares only
// inside one window (docs/ARCHITECTURE.md → Hot-path idioms). Booted directly, with game_end after the summary, when Game's
// Create_0 sets TEST_AUTORUN.

const REPEATS = 3; // per measure, base and run each; the minimum of each is what the figure nets

/**
 * the scene's factory — the one ref the Game object boots, the catalogue labels and openScene takes (see Scene)
 */
globalThis.sceneTest = () => new _SceneTestClass();
Scene.register(sceneTest, {
  label: I18n.textRef("TEST_NAME"),
  category: "SCENE_CAT_DEV",
});

/** standalone SCREEN class — duck-typed contract, see Scene. */
class _SceneTestClass {
  label = "Test";

  create(openScene) {
    this._openScene = openScene; // stashed so retheme() can rebuild the button callbacks
    this._cases = []; // the run
    this._cursor = 0; // index of the case the next update() serves
    this._frame = 0; // frames the current case has been given
    this._ctx = null; // the current case's context (setup fills it, teardown frees it)
    this._t = null; // the current case's collector
    this._pass = 0;
    this._fail = 0;
    this._running = false;
    this._buildUI();
    this._start();
  }

  /** Live theme swap (the Game object's retheme): a plain UI rebuild, the run keeps going. */
  retheme() {
    UI.remove(this.ui);
    this.ui.destroy();
    this._buildUI();
  }

  _buildUI() {
    const openScene = this._openScene;
    this.ui = facetRoot({ maxWidth: 720 });
    UI.insert(this.ui);
    const body = this.ui.body;
    body.insertChild(
      facetHeader(I18n.textRef("TEST_NAME"), { halign: fa_center }),
    );
    body.insertChild(facetHint(I18n.textRef("TEST_HINT")));
    body.insertChild(facetHint(I18n.textRef("TEST_HINT_RERUN")));
    body.insertChild(
      facetHint(() =>
        this._running
          ? I18n.text("TEST_RUNNING", this._cursor, this._cases.length)
          : I18n.text("TEST_DONE", this._pass, this._fail),
      ),
    );
    const col = facetList();
    col.insertChild(
      facetButton(I18n.textRef("TEST_RERUN"), () => {
        if (!this._running) this._start();
      }),
    );
    col.insertChild(
      facetButton(I18n.textRef("TEST_BACK"), () => openScene(sceneLobby)),
    );
    body.insertChild(col);
  }

  /** Queue every case and log the banner; update() drains one case per frame. */
  _start() {
    this._cases = [];
    const core = testCore.CASES;
    for (let i = 0; i < core.length; i++) this._cases.push(core[i]);
    const stress = testStress.CASES; // the scenarios last: seconds each, and they draw
    for (let i = 0; i < stress.length; i++) this._cases.push(stress[i]);
    this._cursor = 0;
    this._frame = 0;
    this._pass = 0;
    this._fail = 0;
    this._running = true;
    // no runtime version in the banner: the GM_* build constants are not in JS scope (docs/GMRT.md)
    Log.info("[TEST] run · " + this._cases.length + " cases");
  }

  update() {
    if (!this._running) return;
    if (this._cursor >= this._cases.length) {
      this._finish();
      return;
    }
    this._step(this._cases[this._cursor]);
  }

  /** A scenario case draws its own level: `draw(ctx)` is optional and runs while the case is live. */
  draw() {
    if (this._ctx === null) return;
    const c = this._cases[this._cursor];
    if (c !== undefined && c.draw !== undefined)
      this._guard("draw", () => c.draw(this._ctx, this._t));
  }

  _finish() {
    this._running = false;
    Log.info("[TEST] done · " + this._pass + " pass · " + this._fail + " fail");
    if (TEST_AUTORUN) game_end();
  }

  /**
   * Run a phase of the current case; an exception is that case's failure (recorded, the run goes
   * on — reporting every case in one run IS the runner's job), never the run's.
   */
  _guard(phase, fn) {
    try {
      fn();
      return true;
    } catch (e) {
      this._t.fails.push(phase + " exception: " + e.message);
      return false;
    }
  }

  /**
   * A case spans `frames` (default 1) frames: setup on its first, `frame(ctx, i, t)` on every
   * one, then verify + teardown on its last. A phase that throws skips straight to teardown.
   */
  _step(c) {
    const frames = c.frames ?? 1;
    let alive = true;
    if (this._frame === 0) {
      this._ctx = {};
      this._t = _testCollector();
      alive = this._guard("setup", () => c.setup(this._ctx));
    }
    if (alive) {
      const i = this._frame;
      if (c.frame !== undefined)
        alive = this._guard("frame " + i, () => c.frame(this._ctx, i, this._t));
    }
    this._frame += 1;
    if (alive) {
      if (this._frame < frames) return;
      this._guard("verify", () => c.verify(this._ctx, this._t));
    }
    if (c.teardown !== undefined)
      this._guard("teardown", () => c.teardown(this._ctx)); // a level left alive would leak
    this._ctx = null;
    SolidSystem.invalidate(); // the case's store is gone; the next one must not read its cache
    this._t.report();
    const fails = this._t.fails;
    if (fails.length === 0) {
      this._pass += 1;
      Log.info("[CHECK] PASS " + c.id);
    } else {
      this._fail += 1;
      for (let k = 0; k < fails.length; k++)
        Log.error("[CHECK] FAIL " + c.id + " : " + fails[k]);
    }
    this._cursor += 1;
    this._frame = 0;
  }

  destroy() {
    // a case mid-flight still owns its level
    if (this._ctx !== null) {
      const c = this._cases[this._cursor];
      if (c !== undefined && c.teardown !== undefined)
        this._guard("teardown", () => c.teardown(this._ctx));
      this._ctx = null;
    }
    UI.remove(this.ui);
    this.ui.destroy();
  }
}

/**
 * The collector a case is handed: the assertions (each miss is one FAIL line); `measure`, which
 * times `run` against `base` — the SAME loop of n without the op — REPEATS times each, keeps the
 * minimum of each, and logs the difference per op as one `[BENCH]` line (the per-op cost net of
 * the loop; returns the ns); and `sample`, which accumulates one value per frame of a scenario
 * under an id, reported by the runner at the case's end as one `[BENCH] <id> p50 … p95 … max …`
 * line — a distribution, since a scenario's cost is its spread, not a mean.
 */
function _testCollector() {
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
}

/** Wall microseconds fn takes. */
function _testTime(fn) {
  const t0 = get_timer();
  fn();
  return get_timer() - t0;
}
