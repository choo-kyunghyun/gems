/**
 * Keyed settings persisted to settings.json. A `defaults` allowlist bounds what load/save
 * touch, so only declared keys round-trip and `get` falls back to the default. Serialized with
 * GML json_stringify (JS JSON.stringify faults on nested values, see docs/GMRT.md), so a value
 * may nest (objects/arrays), not just scalars.
 */
globalThis.Settings = {
  PATH: "settings.json",

  /** @type {Object<string, any>} declared keys + their default values. */
  defaults: {},

  /** @type {Object<string, any>} keys set this session (override defaults). */
  _data: {},

  /** merge into the defaults allowlist (additive; call before load). */
  registerDefaults(obj) {
    Object.assign(this.defaults, obj);
    return this;
  },

  /** the set value, else the default. */
  get(key) {
    return key in this._data ? this._data[key] : this.defaults[key];
  },

  /** set in memory (persisted on save). */
  set(key, value) {
    this._data[key] = value;
    return this;
  },

  /** whether `key` was set and differs from its default. */
  isModified(key) {
    return key in this._data && this._data[key] !== this.defaults[key];
  },

  /** drop all set values (back to defaults). */
  reset() {
    this._data = {};
    return this;
  },

  /** load declared keys from disk (missing file / parse error is a no-op). */
  load() {
    const raw = File.read(this.PATH);
    if (raw === undefined) return this;
    try {
      const parsed = JSON.parse(raw);
      for (const key of Object.keys(this.defaults)) {
        if (key in parsed) this._data[key] = parsed[key];
      }
    } catch (_) {}
    return this;
  },

  /** write every declared key (set value or default) to disk. */
  save() {
    const out = {};
    for (const key of Object.keys(this.defaults)) {
      out[key] = this.get(key);
    }
    File.write(this.PATH, json_stringify(out));
    return this;
  },
};
