// Quest definitions + active progress. Scene drives progress via report(); caller applies rewards on turn-in.
// Per-quest state: { progress: number[], ready: bool, done: bool } — ready = all objectives met, done = turned in.
/**
 * @typedef {Object} QuestDef
 * @property {string} id
 * @property {string} name i18n key @property {string} [desc] i18n key
 * @property {Array<{kind:"kill"|"collect"|"reach", target:string, count:number}>} objectives
 *   `target` is a component token for "kill", an item id for "collect", a marker for "reach";
 *   `progress[i]` counts up to `objectives[i].count`.
 * @property {Array<{itemId:string, qty:number}>} [rewards] item-only BY DESIGN — there is no XP,
 *   so a reward can never be a power shortcut around gathering (see RpgProgression).
 */
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

  // quests are session-scoped; call on level create.
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

  // Advance matching objectives; returns ids of quests that became ready this call.
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

  // Mark done and return rewards for the caller to apply; undefined if not ready.
  complete(id) {
    const st = this.active[id];
    if (st === undefined || !st.ready || st.done) return undefined;
    st.done = true;
    const def = this.defs.get(id);
    return def.rewards ?? {};
  },

  // in registration order — for UI.
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
