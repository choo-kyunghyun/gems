// Achievement registry + unlock persistence — defs are pure data ({ id, name, desc }), NO condition;
// the engine never sweeps. An outside trigger calls unlock(id); the engine checks/persists/reports.
/**
 * Core despite naming progression: with no condition and no sweep the module states no gameplay
 * rule, so it is a persistence service like SaveData and the trigger rules stay with the content
 * that owns them.
 *
 * unlock(id) checks the request (registered? still locked?), persists, and reports whether it was
 * newly unlocked (the caller toasts). The unlock set persists as a native id array under SaveData's
 * "achievements" key (SaveData serializes nested via json_stringify — see docs/GMRT.md).
 */
globalThis.Achievement = {
  // ── Registry facade (Registry owns the store's contract) ──
  _defs: new Map(),
  _order: [],
  _unlocked: {}, // id -> true

  register(defs) {
    Registry.register(Achievement, defs);
    return this;
  },

  /**
   * restore from SaveData (an id array under "achievements"; legacy/missing → empty)
   */
  load() {
    this._unlocked = {};
    const ids = SaveData.get("achievements", null);
    if (Array.isArray(ids))
      for (let i = 0; i < ids.length; i++) this._unlocked[ids[i]] = true;
    return this;
  },

  get(id) {
    return Registry.get(Achievement, id);
  },

  isUnlocked(id) {
    return this._unlocked[id] === true;
  },

  all() {
    return Registry.all(Achievement);
  },

  /**
   * the unlock REQUEST: honor it if the id is registered and still locked; persists.
   * Returns true only when newly unlocked (dedup — safe to request repeatedly).
   */
  unlock(id) {
    if (!Registry.has(Achievement, id) || this._unlocked[id] === true)
      return false;
    this._unlocked[id] = true;
    this._persist();
    return true;
  },

  /** debug: unlock everything (Debug overlay "Achievements" section) */
  unlockAll() {
    for (let i = 0; i < this._order.length; i++)
      this._unlocked[this._order[i]] = true;
    this._persist();
  },

  /** debug: relock everything (persists the empty set) */
  clear() {
    this._unlocked = {};
    this._persist();
  },

  _persist() {
    const ids = [];
    for (let i = 0; i < this._order.length; i++) {
      if (this._unlocked[this._order[i]]) ids.push(this._order[i]);
    }
    SaveData.set("achievements", ids);
    SaveData.save();
  },
};
