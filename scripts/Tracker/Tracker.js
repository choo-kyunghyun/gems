// THE progression state of one save — lifetime counters, achievement unlocks, and active quest
// progress in one struct, behind one report seam. Gameplay reports a fact ONCE (report) and the
// fan-out happens here, so a chokepoint can no longer bump a counter and forget the consumers.
/**
 * Names NO key and states NO rule: the counter names, the unlock thresholds, and the objective
 * counts all belong to content, reached through the injected `rules` hook (the same idiom as
 * `Combat.mitigate`). That is what keeps this a store rather than a game — `Achievement`/`QuestLog`
 * stay pure def registries beside it, and the engine still never sweeps a condition.
 *
 * `rules` is OPTIONAL: with none wired the counter and achievement stages simply don't run and
 * quests still advance (sceneUIKit demos the tracker widget with no achievement content at all).
 *
 * The whole struct is SESSION state whose only home is the save slot's bundle (SaveGame's sim
 * pass) — nothing here touches disk.
 */
globalThis.Tracker = {
  /**
   * injected by the scene that owns the rules — { counterOf(kind), report(key, total) → ids }.
   * null leaves the counter/achievement stages inert.
   */
  rules: null,

  _counters: {}, // key -> number (lifetime tallies; every key is the caller's)
  _unlocked: {}, // achievement id -> true
  _quests: {}, // quest id -> { progress: number[], ready: bool, done: bool }

  /** start blank — a new game inherits no prior session's progression (scene create() once) */
  reset() {
    this._counters = {};
    this._unlocked = {};
    this._quests = {};
    return this;
  },

  // ── THE seam ──

  /**
   * Report one gameplay fact and fan it out: bump the counter content maps this `kind` to, offer
   * the new total to the threshold rules, then advance every matching quest objective. `kind` is
   * the event ("kill"/"collect"/"reach"/"talk"/"quest"/"sleepSkip"), `target` the specific thing
   * (species, item id, marker, NPC id) an objective matches on.
   *
   * Returns what the caller has to act on: `unlocked` (toast them) and `ready` (quests that became
   * turn-in-able THIS call). A kind with no counter and a kind no objective matches are both
   * normal — each stage skips independently.
   */
  report(kind, target, n = 1) {
    const rules = this.rules;
    let unlocked = [];
    if (rules !== null) {
      const key = rules.counterOf(kind);
      if (key !== undefined) {
        this._counters[key] = (this._counters[key] ?? 0) + n;
        unlocked = rules.report(key, this._counters[key]);
      }
    }
    return { unlocked: unlocked, ready: this._advance(kind, target, n) };
  },

  // ── counters ──

  count(key) {
    return this._counters[key] ?? 0;
  },

  // ── achievements (defs live in the Achievement registry) ──

  isUnlocked(id) {
    return this._unlocked[id] === true;
  },

  /**
   * the unlock REQUEST: honor it if the id is registered and still locked. Returns true only when
   * newly unlocked (dedup — safe to request repeatedly).
   */
  unlock(id) {
    if (!Registry.has(Achievement, id) || this._unlocked[id] === true)
      return false;
    this._unlocked[id] = true;
    return true;
  },

  // ── quests (defs live in the QuestLog registry) ──

  accept(id) {
    const def = QuestLog.def(id);
    if (def === undefined || this._quests[id] !== undefined) return false;
    const progress = [];
    for (let i = 0; i < def.objectives.length; i++) progress.push(0);
    this._quests[id] = { progress: progress, ready: false, done: false };
    return true;
  },

  /**
   * Mark done and return rewards for the caller to apply; undefined if not ready. `done` is set
   * BEFORE the rewards go out, so applying them can re-enter report() without the quest re-firing.
   */
  complete(id) {
    const st = this._quests[id];
    if (st === undefined || !st.ready || st.done) return undefined;
    st.done = true;
    return QuestLog.def(id).rewards ?? {};
  },

  isActive(id) {
    const st = this._quests[id];
    return st !== undefined && !st.done;
  },

  isReady(id) {
    const st = this._quests[id];
    return st !== undefined && st.ready && !st.done;
  },

  isDone(id) {
    const st = this._quests[id];
    return st !== undefined && st.done;
  },

  // ── the UIQuestTracker source contract (status/def/activeIds — see UIQuestTracker) ──

  status(id) {
    return this._quests[id];
  },

  def(id) {
    return QuestLog.def(id);
  },

  /** in registration order — for UI. */
  activeIds() {
    const order = QuestLog.ids();
    const out = [];
    for (let i = 0; i < order.length; i++) {
      const st = this._quests[order[i]];
      if (st !== undefined && !st.done) out.push(order[i]);
    }
    return out;
  },

  // ── save bundle ──

  /**
   * the whole progression as one blob, for the bundle's sim pass
   */
  export() {
    const unlocked = [];
    const order = Achievement.all();
    for (let i = 0; i < order.length; i++)
      if (this._unlocked[order[i].id]) unlocked.push(order[i].id);
    return {
      counters: this._counters,
      unlocked: unlocked,
      quests: this._quests,
    };
  },

  /**
   * REPLACE the whole progression from a bundle blob — a load is not a merge. Anything but a plain
   * object (a legacy blob, a missing key) restores blank.
   */
  import(d) {
    this.reset();
    if (d === null || typeof d !== "object" || Array.isArray(d)) return this;
    const c = d.counters;
    if (c !== null && typeof c === "object" && !Array.isArray(c))
      for (const k in c) this._counters[k] = c[k];
    if (Array.isArray(d.unlocked))
      for (let i = 0; i < d.unlocked.length; i++)
        this._unlocked[d.unlocked[i]] = true;
    const q = d.quests;
    if (q !== null && typeof q === "object" && !Array.isArray(q))
      for (const k in q) this._quests[k] = q[k];
    return this;
  },

  // ── internals ──

  /**
   * Advance every active objective matching {kind, target} by `n` (clamped to its count); returns
   * the ids of quests that became READY on this call. Moved verbatim from QuestLog.report.
   */
  _advance(kind, target, n) {
    const order = QuestLog.ids();
    const became = [];
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      const st = this._quests[id];
      if (st === undefined || st.ready || st.done) continue;
      const def = QuestLog.def(id);
      let advanced = false;
      for (let o = 0; o < def.objectives.length; o++) {
        const obj = def.objectives[o];
        if (
          obj.kind === kind &&
          obj.target === target &&
          st.progress[o] < obj.count
        ) {
          const v = st.progress[o] + n;
          st.progress[o] = v > obj.count ? obj.count : v;
          advanced = true;
        }
      }
      if (advanced && this._allMet(def, st)) {
        st.ready = true;
        became.push(id);
      }
    }
    return became;
  },

  _allMet(def, st) {
    for (let o = 0; o < def.objectives.length; o++) {
      if (st.progress[o] < def.objectives[o].count) return false;
    }
    return true;
  },
};
