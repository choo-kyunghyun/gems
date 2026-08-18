// Quest definitions + active progress. Scene drives progress via report(); caller applies rewards on turn-in.
// Per-quest state: { progress: number[], ready: bool, done: bool } — ready = all objectives met, done = turned in.
/**
 * @typedef {Object} QuestDef
 * @property {string} id
 * @property {string} name i18n key
 * @property {string} objLabel i18n key of the objective line, formatted with (progress, count) —
 *   one label per def, reused by every objective (UIQuestTracker).
 * @property {Array<{kind:"kill"|"collect"|"reach"|"talk", target:string, count:number}>} objectives
 *   `target` is a component token for "kill", an item id for "collect", a marker for "reach", an
 *   NPC id for "talk"; `progress[i]` counts up to `objectives[i].count`.
 * @property {{items: Array<{itemId:string, qty:number}>}} [rewards] item-only BY DESIGN — there is
 *   no XP, so a reward can never be a power shortcut around gathering (see Progression). The
 *   wrapper object is what `complete`'s `?? {}` fallback stands in for.
 */
globalThis.QuestLog = {
  // ── Definitions — a Registry facade (Registry owns the store's contract) ──
  _defs: new Map(),
  _order: [],
  active: {}, // id -> state

  register(defs) {
    Registry.register(QuestLog, defs);
    return this;
  },

  /**
   * every quest def in registration order — the editor's quest picker.
   */
  all() {
    return Registry.all(QuestLog);
  },

  /**
   * quests are session-scoped; call on scene create.
   */
  reset() {
    this.active = {};
    return this;
  },

  accept(id) {
    const def = Registry.get(QuestLog, id);
    if (def === undefined || this.active[id] !== undefined) return false;
    const progress = [];
    for (let i = 0; i < def.objectives.length; i++) progress.push(0);
    this.active[id] = { progress: progress, ready: false, done: false };
    return true;
  },

  // Advance matching objectives; returns ids of quests that became ready this call.
  report(kind, target, n = 1) {
    const became = [];
    for (let i = 0; i < this._order.length; i++) {
      const id = this._order[i];
      const st = this.active[id];
      if (st === undefined || st.ready || st.done) continue;
      const def = Registry.get(QuestLog, id);
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
    return Registry.get(QuestLog, id);
  },

  /**
   * Mark done and return rewards for the caller to apply; undefined if not ready.
   */
  complete(id) {
    const st = this.active[id];
    if (st === undefined || !st.ready || st.done) return undefined;
    st.done = true;
    const def = Registry.get(QuestLog, id);
    return def.rewards ?? {};
  },

  /**
   * in registration order — for UI.
   */
  activeIds() {
    const out = [];
    for (let i = 0; i < this._order.length; i++) {
      const id = this._order[i];
      const st = this.active[id];
      if (st !== undefined && !st.done) out.push(id);
    }
    return out;
  },
};
