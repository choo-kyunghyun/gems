// Achievement registry + unlock persistence. defs: { id, name, desc, condition(counters)->bool }.
// evaluate() unlocks + persists any met achievements, returns newly-unlocked ids for toasting.
// Persisted as comma-joined ids (JSON.stringify faults on nested — flat scalar blob only).
globalThis.Achievement = {
  defs: new Map(),
  order: [], // stable registration order
  _unlocked: {}, // id -> true

  register(defs) {
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      if (!this.defs.has(d.id)) this.order.push(d.id);
      this.defs.set(d.id, d);
    }
    return this;
  },

  // restore from SaveData (comma-joined ids under "achievements")
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

  // unlock any achievements whose condition is met; returns newly-unlocked ids
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
