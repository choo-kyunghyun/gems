// Lifetime counters — SESSION state whose only home is the save slot's bundle (SaveGame's sim pass
// captures and restores them), so nothing here touches disk and a new game starts at zero. Every
// key is the caller's — this store names none, which is what keeps a lifetime-counter store free of
// any gameplay rule.
globalThis.Profile = {
  _counters: {},

  /** start empty — a new game inherits no prior session's records (scene create() once) */
  reset() {
    this._counters = {};
    return this;
  },

  get(key) {
    return this._counters[key] ?? 0;
  },

  add(key, n = 1) {
    this._counters[key] = (this._counters[key] ?? 0) + n;
    return this._counters[key];
  },

  set(key, value) {
    this._counters[key] = value;
    return this;
  },

  /**
   * the counter map, for the bundle's sim pass
   */
  export() {
    return this._counters;
  },

  /**
   * REPLACE the map from a bundle blob — a load is not a merge. Anything but a plain object
   * (a legacy blob, a missing key) restores empty.
   */
  import(d) {
    this._counters = {};
    if (d !== null && typeof d === "object" && !Array.isArray(d))
      for (const k in d) this._counters[k] = d[k];
    return this;
  },
};
