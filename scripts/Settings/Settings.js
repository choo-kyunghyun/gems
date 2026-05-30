globalThis.Settings = class Settings {
  static PATH = "user_settings.json";

  static defaults = Object.freeze({
    // Localization
    language: "ko-KR",
    // Graphics
    fullscreen: false,
    resolution_w: 0,
    resolution_h: 0,
    fps_limit: 60,
    ui_scale: 1.0,
    // Audio
    vol_master: 1.0,
    vol_music: 1.0,
    vol_sfx: 1.0,
    // Controls
    mouse_sens: 0.5,
    raw_input: false,
  });

  static _data = {};

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
