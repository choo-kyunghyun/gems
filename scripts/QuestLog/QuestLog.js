// Quest definitions + active progress. Definitions are registered at create()
// time; the scene drives progress by calling report(kind, target) after gameplay
// events. A quest objective is { kind: "kill"|"collect"|"reach", target, count }.
// Rewards are { xp?, items?: [{ itemId, qty }] } applied by the caller on turn-in.
//
// Per-quest state: { progress: number[], ready: bool, done: bool }
//   ready = all objectives met (awaiting turn-in); done = turned in.
globalThis.QuestLog = {
  defs: new Map(),
  defOrder: [],
  active: {}, // id -> state

  register(defs) {
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      if (!this.defs.has(d.id)) this.defOrder.push(d.id);
      this.defs.set(d.id, d);
    }
    return this;
  },

  // Clear all active progress (quests are session-scoped; call on scene create).
  reset() {
    this.active = {};
    return this;
  },

  accept(id) {
    const def = this.defs.get(id);
    if (def === undefined || this.active[id] !== undefined) return false;
    const progress = [];
    for (let i = 0; i < def.objectives.length; i++) progress.push(0);
    this.active[id] = { progress: progress, ready: false, done: false };
    return true;
  },

  // Advance every active, not-yet-ready quest objective matching kind+target.
  // Returns the ids of quests that BECAME ready (all objectives met) this call.
  report(kind, target, n = 1) {
    const became = [];
    for (let i = 0; i < this.defOrder.length; i++) {
      const id = this.defOrder[i];
      const st = this.active[id];
      if (st === undefined || st.ready || st.done) continue;
      const def = this.defs.get(id);
      let advanced = false;
      for (let o = 0; o < def.objectives.length; o++) {
        const obj = def.objectives[o];
        if (obj.kind === kind && obj.target === target && st.progress[o] < obj.count) {
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

  isActive(id) {
    const st = this.active[id];
    return st !== undefined && !st.done;
  },

  isReady(id) {
    const st = this.active[id];
    return st !== undefined && st.ready && !st.done;
  },

  isDone(id) {
    const st = this.active[id];
    return st !== undefined && st.done;
  },

  status(id) {
    return this.active[id];
  },

  def(id) {
    return this.defs.get(id);
  },

  // Turn in a ready quest: mark done and return its rewards for the caller to
  // apply. Returns undefined if the quest isn't ready to turn in.
  complete(id) {
    const st = this.active[id];
    if (st === undefined || !st.ready || st.done) return undefined;
    st.done = true;
    const def = this.defs.get(id);
    return def.rewards ?? {};
  },

  // Active (accepted, not turned in) quest ids in registration order — for UI.
  activeIds() {
    const out = [];
    for (let i = 0; i < this.defOrder.length; i++) {
      const id = this.defOrder[i];
      const st = this.active[id];
      if (st !== undefined && !st.done) out.push(id);
    }
    return out;
  },
};
