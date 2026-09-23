/**
 * Keyed settings persisted to a caller-named JSON file. A `defaults` allowlist bounds what
 * load/save touch, so only declared keys round-trip and `get` falls back to the default.
 */
globalThis.Settings = {
  /** Declared keys and their defaults; scalars only. */
  defaults: {},

  local: {},

  /** Additive; call before load. */
  register(obj) {
    Object.assign(Settings.defaults, obj);
    return Settings;
  },

  get(key) {
    return key in Settings.local ? Settings.local[key] : Settings.defaults[key];
  },

  set(key, value) {
    Settings.local[key] = value;
    return Settings;
  },

  /** A nested default would compare by reference and always read modified. */
  isModified(keyOrKeys) {
    const keys = Array.isArray(keyOrKeys) ? keyOrKeys : [keyOrKeys];
    for (const key of keys) {
      if (Settings.get(key) !== Settings.defaults[key]) return true;
    }
    return false;
  },

  reset() {
    Settings.local = {};
    return Settings;
  },

  /** Loads declared keys only; a parse failure warns. */
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
