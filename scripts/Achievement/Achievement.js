// Achievement registry + unlock persistence. defs: { id, name, desc } — pure data, NO condition:
// the engine never evaluates or sweeps. An outside trigger decides an achievement is earned and
// requests it via unlock(id); the engine checks the request (registered? still locked?), persists,
// and reports whether it was newly unlocked (the caller toasts). The demo's trigger rules live in
// RpgAchievements (content), fed by Profile counter changes.
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

  // the unlock REQUEST: honor it if the id is registered and still locked; persists.
  // Returns true only when newly unlocked (dedup — safe to request repeatedly).
  unlock(id) {
    if (!this.defs.has(id) || this._unlocked[id] === true) return false;
    this._unlocked[id] = true;
    this._persist();
    return true;
  },

  // debug: unlock everything (Debug overlay "Achievements" panel)
  unlockAll() {
    for (let i = 0; i < this.order.length; i++)
      this._unlocked[this.order[i]] = true;
    this._persist();
  },

  // debug: relock everything (persists the empty set)
  clear() {
    this._unlocked = {};
    this._persist();
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
