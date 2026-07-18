/**
 * File-IO persistence for the global Input keymap over Input.export()/import() (see Input).
 * load() replaces the whole keymap (Input.import clears actions first).
 *
 * Serialized with GML json_stringify — a JS object IS a GML struct, so the nested export blob
 * (per-action binding lists) round-trips crash-free where JS JSON.stringify would fault on the
 * nesting (see docs/GMRT.md). load() reads it back with native JSON.parse (parse handles nesting;
 * only stringify faults).
 */
globalThis.InputPreset = class InputPreset {
  static PATH = "input.json";

  /** @returns {boolean} whether the file was written. */
  static save() {
    return File.write(this.PATH, json_stringify(Input.export()));
  }

  /** Load + apply the keymap; missing file or bad shape is a no-op. @returns {boolean} applied. */
  static load() {
    const raw = File.read(this.PATH);
    if (raw === undefined) return false;
    try {
      const data = JSON.parse(raw);
      if (
        data === null ||
        typeof data.actions !== "object" ||
        Array.isArray(data.actions)
      )
        return false;
      Input.import(data);
      return true;
    } catch (_) {
      return false;
    }
  }
};
