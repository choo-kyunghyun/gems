// Achievement registry + unlock state — defs are pure data ({ id, name, desc }), NO condition;
// the engine never sweeps. An outside trigger calls unlock(id); the engine checks and reports.
/**
 * Core despite naming progression: with no condition and no sweep the module states no gameplay
 * rule, so it holds state and nothing else, and the trigger rules stay with the content that owns
 * them.
 *
 * unlock(id) checks the request (registered? still locked?) and reports whether it was newly
 * unlocked (the caller toasts). The unlock set is SESSION state whose only home is the save slot's
 * bundle (SaveGame's sim pass) — nothing here touches disk, so an unlock lasts only as far as the
 * next save of that slot, exactly like the health and inventory beside it in the bundle.
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

  /** start locked — a new game inherits no prior session's unlocks (scene create() once) */
  reset() {
    this._unlocked = {};
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
    return true;
  },

  /** debug: unlock everything (Debug overlay "Achievements" section) */
  unlockAll() {
    for (let i = 0; i < this._order.length; i++)
      this._unlocked[this._order[i]] = true;
  },

  /** debug: relock everything */
  clear() {
    this._unlocked = {};
  },

  /**
   * unlocked ids in registration order, for the bundle's sim pass
   */
  export() {
    const ids = [];
    for (let i = 0; i < this._order.length; i++) {
      if (this._unlocked[this._order[i]]) ids.push(this._order[i]);
    }
    return ids;
  },

  /**
   * REPLACE the unlock set from a bundle blob — a load is not a merge. Anything but an id array
   * (a legacy blob, a missing key) restores empty.
   */
  import(ids) {
    this._unlocked = {};
    if (Array.isArray(ids))
      for (let i = 0; i < ids.length; i++) this._unlocked[ids[i]] = true;
    return this;
  },
};
