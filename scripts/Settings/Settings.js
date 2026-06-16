/**
 * Flat key→scalar settings persisted to `settings.json`. A `defaults` allowlist
 * (registered at startup via `registerDefaults`, additively) bounds what `load`
 * reads and `save` writes, so an unknown key on disk is ignored and only declared
 * keys round-trip. `get` falls back to the default when a key was never set.
 * Values must be scalars (GMRT's JSON.stringify faults on nested values).
 */
globalThis.Settings = class Settings {
  static PATH = "settings.json";

  /** @type {Object<string, any>} declared keys + their default values. */
  static defaults = {};

  /** @type {Object<string, any>} keys explicitly set this session (override defaults). */
  static _data = {};

  /** Merge `obj` into the defaults allowlist (additive; call before `load`). @param {Object} obj @returns {Settings} */
  static registerDefaults(obj) {
    Object.assign(this.defaults, obj);
    return this;
  }

  /** @param {string} key @returns {*} the set value, else the default. */
  static get(key) {
    return key in this._data ? this._data[key] : this.defaults[key];
  }

  /** Set `key` in memory (persisted on `save`). @returns {Settings} this */
  static set(key, value) {
    this._data[key] = value;
    return this;
  }

  /** @param {string} key @returns {boolean} whether `key` was set and differs from its default. */
  static isModified(key) {
    return key in this._data && this._data[key] !== this.defaults[key];
  }

  /** Drop all set values (back to defaults). @returns {Settings} this */
  static reset() {
    this._data = {};
    return this;
  }

  /** Load declared keys from `settings.json` (missing file / parse error is a no-op). @returns {Settings} this */
  static load() {
    const raw = File.read(this.PATH);
    if (raw === undefined) return this;
    try {
      const parsed = JSON.parse(raw);
      for (const key of Object.keys(this.defaults)) {
        if (key in parsed) this._data[key] = parsed[key];
      }
    } catch (_) {}
    return this;
  }

  /** Write every declared key (set value or default) to `settings.json`. @returns {Settings} this */
  static save() {
    const out = {};
    for (const key of Object.keys(this.defaults)) {
      out[key] = this.get(key);
    }
    File.write(this.PATH, JSON.stringify(out));
    return this;
  }
};
