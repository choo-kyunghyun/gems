/**
 * Serializes with GML json_stringify (a JS object IS a GML struct — the interop workaround for JS
 * JSON.stringify's nested-value fault, see docs/GMRT.md), so a value may nest (objects/arrays), not
 * just scalars. No asset refs / cycles here — use the Json codec for those.
 */
globalThis.SaveData = {
  PATH: "save.json",
  _data: {},

  /**
   * @returns {typeof SaveData}
   */
  load() {
    const raw = File.read(this.PATH);
    if (raw !== undefined) {
      try {
        this._data = JSON.parse(raw);
      } catch (_) {
        Log.error(
          "SaveData: parse error in " + this.PATH + " — starting empty",
        );
        this._data = {};
      }
    }
    return this;
  },

  /**
   * @param {string} key
   * @param {*} [fallback]
   * @returns {*}
   */
  get(key, fallback) {
    return key in this._data ? this._data[key] : fallback;
  },

  /**
   * @param {string} key
   * @param {*} value
   * @returns {typeof SaveData}
   */
  set(key, value) {
    this._data[key] = value;
    return this;
  },

  /**
   * @returns {typeof SaveData}
   */
  save() {
    // json_stringify serializes nested values crash-free (JS JSON.stringify faults on them).
    File.write(this.PATH, json_stringify(this._data));
    return this;
  },
};
