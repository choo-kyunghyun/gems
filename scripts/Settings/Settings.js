/**
 * Keyed settings persisted to a caller-named JSON file. A `defaults` allowlist bounds what
 * load/save touch, so only declared keys round-trip and `get` falls back to the default.
 */
globalThis.Settings = {
  /** Declared keys + their default values. Scalars only — see `isModified`. */
  defaults: {},

  /** Keys set this session (override defaults). */
  local: {},

  /**
   * merge into the defaults allowlist (additive; call before load).
   */
  register(obj) {
    Object.assign(this.defaults, obj);
    return this;
  },

  /**
   * the set value, else the default.
   */
  get(key) {
    return key in this.local ? this.local[key] : this.defaults[key];
  },

  /**
   * set in memory (persisted on save).
   */
  set(key, value) {
    this.local[key] = value;
    return this;
  },

  /**
   * whether `key` — one key or an array of them — differs from its declared default. Every
   * declared default is a scalar, so `!==` is the whole test: a nested default would compare
   * by reference and always read modified.
   */
  isModified(keyOrKeys) {
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
    for (const key of keys) {
      if (this.get(key) !== this.defaults[key]) return true;
    }
    return false;
  },

  /**
   * drop all set values (back to defaults).
   */
  reset() {
    this.local = {};
    return this;
  },

  /**
   * Load declared keys from disk. Logs a warning on parse failure.
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
   */
  save(fname) {
    const out = {};
    for (const key of Object.keys(this.defaults)) {
      if (key in this.local) out[key] = this.local[key];
    }
    // BUG: [#15565] json_stringify, not JSON.stringify
    File.write(fname, json_stringify(out));
    return this;
  },
};
