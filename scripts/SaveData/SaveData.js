// Flat key→scalar JSON persistence — a sibling to Settings, but without a
// defaults allowlist (it stores whatever keys are set). Backs Profile and
// Achievement. Values must be scalars (string/number/bool): GMRT's JSON.stringify
// faults on nested objects/arrays, so callers that need structure serialize it to
// a scalar string themselves (see Profile/Achievement). Call load() once at
// startup, save() after mutations.
globalThis.SaveData = class SaveData {
  static PATH = "save.json";
  static _data = {};

  static load() {
    const raw = File.read(this.PATH);
    if (raw !== undefined) {
      try {
        this._data = JSON.parse(raw);
      } catch (_) {
        this._data = {};
      }
    }
    return this;
  }

  static get(key, fallback) {
    return key in this._data ? this._data[key] : fallback;
  }

  static set(key, value) {
    this._data[key] = value;
    return this;
  }

  static save() {
    // _data is flat scalar (see header) so the 1-arg form is safe, as in Settings.
    File.write(this.PATH, JSON.stringify(this._data));
    return this;
  }
};
