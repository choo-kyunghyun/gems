// Lifetime counters under SaveData's "profile" key (native object — nested via json_stringify, see
// docs/GMRT.md); load() needs SaveData.load() first. Every key is the caller's — this store names
// none, which is what keeps a lifetime-counter store free of any gameplay rule.
globalThis.Profile = {
  _counters: {},

  load() {
    this._counters = {};
    // accept only a plain object (a legacy string blob / missing value resets to empty)
    const saved = SaveData.get("profile", null);
    if (saved !== null && typeof saved === "object" && !Array.isArray(saved))
      for (const k in saved) this._counters[k] = saved[k];
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
   * raw counter map — the save bundle's profile blob (SaveGame)
   */
  counters() {
    return this._counters;
  },

  /**
   * persist the counter map to SaveData (nested-safe via json_stringify)
   */
  save() {
    SaveData.set("profile", this._counters);
    SaveData.save();
    return this;
  },
};
