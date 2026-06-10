// Achievement registry + persistence. Each def is { id, name, desc, condition },
// where condition(profileCounters) -> boolean. evaluate() unlocks any met
// achievement, persists the unlocked id set via SaveData, and returns the
// newly-unlocked ids so the scene can toast them. Call load() after SaveData.load().
//
// Implemented as a plain object (not a class): GMRT hard-faults when a class's
// static method calls another static method, so evaluate()->_persist() must be
// object-method dispatch (the same pattern QuestLog/Profile use).
globalThis.Achievement = {
  defs: new Map(),
  order: [], // registration order of ids
  _unlocked: {}, // id -> true

  register(defs) {
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      if (!this.defs.has(d.id)) this.order.push(d.id);
      this.defs.set(d.id, d);
    }
    return this;
  },

  // Restore the unlocked set from SaveData (comma-joined ids under "achievements").
  load() {
    this._unlocked = {};
    const saved = SaveData.get("achievements", "");
    if (saved.length > 0) {
      const ids = saved.split(",");
      for (let i = 0; i < ids.length; i++) this._unlocked[ids[i]] = true;
    }
    return this;
  },

  get(id) {
    return this.defs.get(id);
  },

  isUnlocked(id) {
    return this._unlocked[id] === true;
  },

  all() {
    const out = [];
    for (let i = 0; i < this.order.length; i++) {
      out.push(this.defs.get(this.order[i]));
    }
    return out;
  },

  // Check every locked achievement against the profile counters; unlock + persist
  // any whose condition is met. Returns the newly-unlocked ids (in tier order).
  evaluate(counters) {
    const newly = [];
    for (let i = 0; i < this.order.length; i++) {
      const id = this.order[i];
      if (this._unlocked[id]) continue;
      const a = this.defs.get(id);
      if (a.condition !== undefined && a.condition(counters)) {
        this._unlocked[id] = true;
        newly.push(id);
      }
    }
    if (newly.length > 0) this._persist();
    return newly;
  },

  _persist() {
    const ids = [];
    for (let i = 0; i < this.order.length; i++) {
      if (this._unlocked[this.order[i]]) ids.push(this.order[i]);
    }
    SaveData.set("achievements", ids.join(","));
    SaveData.save();
  },
};
