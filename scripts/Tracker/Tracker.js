// THE progression state of one world — lifetime counters, achievement unlocks, and active quest
// progress in one record, behind one report seam. Gameplay reports a fact ONCE (report) and the
// fan-out happens here, so a chokepoint can no longer bump a counter and forget the consumers.
/**
 * Names NO key and states NO rule: the counter names, the unlock thresholds, and the objective
 * counts all belong to content, reached through the injected `rules` hook (the same idiom as
 * `Combat.mitigate`). That is what keeps this a store rather than a game — `Achievement`/`QuestLog`
 * stay pure def registries beside it, and the engine still never sweeps a condition.
 *
 * `rules` is OPTIONAL: with none wired the counter and achievement stages simply don't run and
 * quests still advance (sceneFacet demos the tracker widget with no achievement content at all).
 *
 * Logic over ONE world record (World.self under KEY — { counters, unlocked, quests }), so the
 * progression starts blank with the world (World.reset) and rides the save with its records —
 * nothing here touches disk.
 */
globalThis.Tracker = {
  KEY: "tracker", // its token on the world's own entity — a data key (a save holds it)

  /**
   * injected by the scene that owns the rules — { counterOf(kind), report(key, total) → ids }.
   * null leaves the counter/achievement stages inert.
   */
  rules: null,

  /**
   * The progression record: `counters` key -> number (lifetime tallies; every key is the
   * caller's), `unlocked` achievement id -> true, `quests` quest id -> { progress: number[],
   * ready, done }.
   */
  state() {
    return World.table.of(World.self, Tracker.KEY, () => ({
      counters: {},
      unlocked: {},
      quests: {},
    }));
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
    const rules = Tracker.rules;
    let unlocked = [];
    if (rules !== null) {
      const key = rules.counterOf(kind);
      if (key !== undefined) {
        const counters = Tracker.state().counters;
        counters[key] = (counters[key] ?? 0) + n;
        unlocked = rules.report(key, counters[key]);
      }
    }
    return { unlocked: unlocked, ready: Tracker._advance(kind, target, n) };
  },

  // ── counters ──

  count(key) {
    return Tracker.state().counters[key] ?? 0;
  },

  // ── achievements (defs live in the Achievement registry) ──

  isUnlocked(id) {
    return Tracker.state().unlocked[id] === true;
  },

  /**
   * the unlock REQUEST: honor it if the id is registered and still locked. Returns true only when
   * newly unlocked (dedup — safe to request repeatedly).
   */
  unlock(id) {
    const unlocked = Tracker.state().unlocked;
    if (!Registry.has(Achievement, id) || unlocked[id] === true) return false;
    unlocked[id] = true;
    return true;
  },

  // ── quests (defs live in the QuestLog registry) ──

  accept(id) {
    const def = QuestLog.def(id);
    const quests = Tracker.state().quests;
    if (def === undefined || quests[id] !== undefined) return false;
    const progress = [];
    for (let i = 0; i < def.objectives.length; i++) progress.push(0);
    quests[id] = { progress: progress, ready: false, done: false };
    return true;
  },

  /**
   * Mark done and return rewards for the caller to apply; undefined if not ready. `done` is set
   * BEFORE the rewards go out, so applying them can re-enter report() without the quest re-firing.
   */
  complete(id) {
    const st = Tracker.state().quests[id];
    if (st === undefined || !st.ready || st.done) return undefined;
    st.done = true;
    return QuestLog.def(id).rewards ?? {};
  },

  isActive(id) {
    const st = Tracker.state().quests[id];
    return st !== undefined && !st.done;
  },

  isReady(id) {
    const st = Tracker.state().quests[id];
    return st !== undefined && st.ready && !st.done;
  },

  isDone(id) {
    const st = Tracker.state().quests[id];
    return st !== undefined && st.done;
  },

  // ── the UIQuestTracker source contract (status/def/activeIds — see UIQuestTracker) ──

  status(id) {
    return Tracker.state().quests[id];
  },

  def(id) {
    return QuestLog.def(id);
  },

  /** in registration order — for UI. */
  activeIds() {
    const quests = Tracker.state().quests;
    const order = QuestLog.ids();
    const out = [];
    for (let i = 0; i < order.length; i++) {
      const st = quests[order[i]];
      if (st !== undefined && !st.done) out.push(order[i]);
    }
    return out;
  },

  // ── internals ──

  /**
   * Advance every active objective matching {kind, target} by `n` (clamped to its count); returns
   * the ids of quests that became READY on this call.
   */
  _advance(kind, target, n) {
    const quests = Tracker.state().quests;
    const order = QuestLog.ids();
    const became = [];
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      const st = quests[id];
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
      if (advanced && Tracker._allMet(def, st)) {
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
