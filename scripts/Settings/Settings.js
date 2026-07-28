/**
 * Keyed settings persisted to a caller-named JSON file — the filename is passed to load/save,
 * never stored or validated here (the app shell owns it). A `defaults` allowlist bounds what
 * load/save touch, so only declared keys round-trip and `get` falls back to the default.
 * Serialized with GML json_stringify (JS JSON.stringify faults on nested values, see
 * docs/GMRT.md), so a value may nest (objects/arrays), not just scalars.
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
   * load declared keys from disk (missing file is a no-op; a parse error warns + keeps defaults).
   * @param {string} filename
   * @returns {typeof Settings}
   */
  load(filename) {
    const raw = File.read(filename);
    if (raw === undefined) return this;
    try {
      const parsed = JSON.parse(raw);
      for (const key of Object.keys(this.defaults)) {
        if (key in parsed) this.local[key] = parsed[key];
      }
    } catch (_) {
      Log.warn("Settings: parse error in " + filename + " — keeping defaults");
    }
    return this;
  },

  /**
   * write every declared key (set value or default) to disk.
   * @param {string} filename
   * @returns {typeof Settings}
   */
  save(filename) {
    const out = {};
    for (const key of Object.keys(this.defaults)) {
      out[key] = this.get(key);
    }
    File.write(filename, json_stringify(out));
    return this;
  },
};
