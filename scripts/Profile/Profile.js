// Lifetime counters, persisted as a native object under SaveData's "profile" key (SaveData
// serializes nested via json_stringify — see docs/GMRT.md). Feed to Achievement.evaluate.
// Requires SaveData.load() first.
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

  // raw counter map for Achievement.evaluate and UI records
  counters() {
    return this._counters;
  },

  // persist the counter map to SaveData (nested-safe via json_stringify)
  save() {
    SaveData.set("profile", this._counters);
    SaveData.save();
    return this;
  },
};
