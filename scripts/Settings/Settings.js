globalThis.Settings = class Settings {
  static PATH = "settings.json";

  static defaults = {};

  static _data = {};

  static registerDefaults(obj) {
    Object.assign(this.defaults, obj);
    return this;
  }

  static get(key) {
    return key in this._data ? this._data[key] : this.defaults[key];
  }

  static set(key, value) {
    this._data[key] = value;
    return this;
  }

  static isModified(key) {
    return key in this._data && this._data[key] !== this.defaults[key];
  }

  static reset() {
    this._data = {};
    return this;
  }

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

  static save() {
    const out = {};
    for (const key of Object.keys(this.defaults)) {
      out[key] = this.get(key);
    }
    File.write(this.PATH, JSON.stringify(out));
    return this;
  }
};
