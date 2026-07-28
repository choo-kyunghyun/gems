/**
 * Keyed settings persisted to a caller-named JSON file. A `defaults` allowlist bounds what
 * load/save touch, so only declared keys round-trip and `get` falls back to the default.
 */
globalThis.Settings = {
  /** @type {Object<string, any>} declared keys + their default values. */
  defaults: {},

  /** @type {Object<string, any>} keys set this session (override defaults). */
  local: {},

  /**
   * merge into the defaults allowlist (additive; call before load).
   * @param {Object<string, any>} obj
   * @returns {typeof Settings}
   */
  register(obj) {
    Object.assign(this.defaults, obj);
    return this;
  },

  /**
   * the set value, else the default.
   * @param {string} key
   * @returns {any}
   */
  get(key) {
    return key in this.local ? this.local[key] : this.defaults[key];
  },

  /**
   * set in memory (persisted on save).
   * @param {string} key
   * @param {any} value
   * @returns {typeof Settings}
   */
  set(key, value) {
    this.local[key] = value;
    return this;
  },

  /**
   * whether `key` was set and differs from its default.
   * @param {string} key
   * @returns {boolean}
   */
  isModified(key) {
    return key in this.local && this.local[key] !== this.defaults[key];
  },

  /**
   * drop all set values (back to defaults).
   * @returns {typeof Settings}
   */
  reset() {
    this.local = {};
    return this;
  },

  /**
   * Load declared keys from disk. Logs a warning on parse failure.
   * @param {string} fname
   * @returns {typeof Settings}
   */
  load(fname) {
    const raw = File.read(fname);
    if (raw === undefined) return this;
    try {
      const parsed = JSON.parse(raw);
      for (const key of Object.keys(this.defaults)) {
        if (key in parsed) this.local[key] = parsed[key];
      }
    } catch (_) {
      Log.warn("Settings: parse error in " + fname);
    }
    return this;
  },

  /**
   * write the declared keys set this session to disk; unset keys stay on defaults.
   * @param {string} fname
   * @returns {typeof Settings}
   */
  save(fname) {
    /** @type {Object<string, any>} */
    const out = {};
    for (const key of Object.keys(this.defaults)) {
      if (key in this.local) out[key] = this.local[key];
    }
    // json_stringify, not JSON.stringify — native faults on nested values (#15565)
    File.write(fname, json_stringify(out));
    return this;
  },
};
