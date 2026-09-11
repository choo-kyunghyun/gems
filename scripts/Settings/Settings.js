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
    Object.assign(Settings.defaults, obj);
    return Settings;
  },

  /**
   * the set value, else the default.
   */
  get(key) {
    return key in Settings.local ? Settings.local[key] : Settings.defaults[key];
  },

  /**
   * set in memory (persisted on save).
   */
  set(key, value) {
    Settings.local[key] = value;
    return Settings;
  },

  /**
   * whether `key` — one key or an array of them — differs from its declared default. Every
   * declared default is a scalar, so `!==` is the whole test: a nested default would compare
   * by reference and always read modified.
   */
  isModified(keyOrKeys) {
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
    for (const key of keys) {
      if (Settings.get(key) !== Settings.defaults[key]) return true;
    }
    return false;
  },

  /**
   * drop all set values (back to defaults).
   */
  reset() {
    Settings.local = {};
    return Settings;
  },

  /**
   * Load declared keys from disk. Logs a warning on parse failure.
   */
  load(fname) {
    const raw = File.read(fname);
    if (raw === undefined) return Settings;
    try {
      const parsed = JSON.parse(raw);
      for (const key of Object.keys(Settings.defaults)) {
        if (key in parsed) Settings.local[key] = parsed[key];
      }
    } catch (_) {
      Log.warn("Settings: parse error in " + fname);
    }
    return Settings;
  },

  /**
   * write the declared keys set this session to disk; unset keys stay on defaults.
   */
  save(fname) {
    const out = {};
    for (const key of Object.keys(Settings.defaults)) {
      if (key in Settings.local) out[key] = Settings.local[key];
    }
    // BUG: [#15565] json_stringify, not JSON.stringify
    File.write(fname, json_stringify(out));
    return Settings;
  },
};
