// Lifetime/record counters. Kept in memory as a { name: number } map; persisted
// through SaveData as a single flat "k=v;k=v" string under the "profile" key
// (SaveData only stores scalars). Achievement.evaluate reads these counters.
// Requires SaveData.load() to have run first.
globalThis.Profile = {
  _counters: {},

  load() {
    this._counters = {};
    const s = SaveData.get("profile", "");
    if (s.length > 0) {
      const parts = s.split(";");
      for (let i = 0; i < parts.length; i++) {
        const kv = parts[i].split("=");
        this._counters[kv[0]] = Number(kv[1]) || 0;
      }
    }
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

  // Expose the raw counters for Achievement.evaluate and UI records.
  counters() {
    return this._counters;
  },

  // Flatten counters to "k=v;k=v" and write through SaveData.
  save() {
    const parts = [];
    for (const k in this._counters) parts.push(k + "=" + this._counters[k]);
    SaveData.set("profile", parts.join(";"));
    SaveData.save();
    return this;
  },
};
