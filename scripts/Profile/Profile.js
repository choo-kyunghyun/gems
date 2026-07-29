// Lifetime counters under SaveData's "profile" key (native object — nested via json_stringify, see
// docs/GMRT.md); load() needs SaveData.load() first, unlocks trigger via RpgAchievements.report.
globalThis.Profile = {
  _counters: {},

  /**
   * @returns {typeof Profile}
   */
  load() {
    this._counters = {};
    // accept only a plain object (a legacy string blob / missing value resets to empty)
    const saved = SaveData.get("profile", null);
    if (saved !== null && typeof saved === "object" && !Array.isArray(saved))
      for (const k in saved) this._counters[k] = saved[k];
    return this;
  },

  /**
   * @param {string} key
   * @returns {number}
   */
  get(key) {
    return this._counters[key] ?? 0;
  },

  /**
   * @param {string} key
   * @param {number} [n=1]
   * @returns {number}
   */
  add(key, n = 1) {
    this._counters[key] = (this._counters[key] ?? 0) + n;
    return this._counters[key];
  },

  /**
   * @param {string} key
   * @param {number} value
   * @returns {typeof Profile}
   */
  set(key, value) {
    this._counters[key] = value;
    return this;
  },

  /**
   * raw counter map — the save bundle's profile blob (SaveGame)
   * @returns {Object<string, number>}
   */
  counters() {
    return this._counters;
  },

  /**
   * persist the counter map to SaveData (nested-safe via json_stringify)
   * @returns {typeof Profile}
   */
  save() {
    SaveData.set("profile", this._counters);
    SaveData.save();
    return this;
  },
};
