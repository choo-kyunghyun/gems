/**
 * The progression state of one world, behind one report seam.
 *
 * It names no key and states no rule: counter names, unlock thresholds and objective counts
 * belong to content, reached through the injected `rules` hook, which keeps this a store rather
 * than a game. With no `rules` the counter and achievement stages are inert and quests still
 * advance.
 *
 * The state is one record on the world's own entity, so it starts blank with the world and rides
 * its save; nothing here touches disk.
 */
globalThis.Tracker = {
  KEY: "tracker", // saved

  /** { counterOf(kind), report(key, total) → ids }, injected by the scene that owns the rules. */
  rules: null,

  /**
   * `counters` key -> lifetime tally (every key is the caller's), `unlocked` achievement id ->
   * true, `quests` quest id -> { progress: number[], ready, done }.
   */
  state() {
    return World.table.of(World.self, Tracker.KEY, () => ({
      counters: {},
      unlocked: {},
      quests: {},
    }));
  },

  /**
   * Report one gameplay fact: bump its counter, offer the total to the unlock rules, and advance
   * every matching quest objective. `target` is what an objective matches on. Returns what the
   * caller acts on: `unlocked` and `ready` (quests that became turn-in-able this call). Each
   * stage skips independently when nothing matches.
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

  count(key) {
    return Tracker.state().counters[key] ?? 0;
  },

  isUnlocked(id) {
    return Tracker.state().unlocked[id] === true;
  },

  /** Idempotent; true only when newly unlocked. An unregistered id is refused. */
  unlock(id) {
    const unlocked = Tracker.state().unlocked;
    if (!Registry.has(Achievement, id) || unlocked[id] === true) return false;
    unlocked[id] = true;
    return true;
  },

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
   * Returns the rewards for the caller to apply, or undefined if not ready. `done` is set first,
   * so applying them can re-enter report() without the quest re-firing.
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

  status(id) {
    return Tracker.state().quests[id];
  },

  def(id) {
    return QuestLog.def(id);
  },

  /** In registration order. */
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

  /** Returns the ids of quests that became ready on this call. */
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
