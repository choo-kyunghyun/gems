/**
 * File-IO persistence for the player input profile — Input.export()/import(): sensitivity,
 * deadzone, keyboard rebinds. Loaded at boot over the registered keymap (Game Create_0), saved
 * by the settings Save (GameOverlay).
 *
 * Serialized with GML json_stringify — a JS object IS a GML struct, so the nested blob (the
 * rebinds table) round-trips crash-free where JS JSON.stringify would fault on the nesting (see
 * docs/GMRT.md). load() reads it back with native JSON.parse (parse handles nesting; only
 * stringify faults).
 */
globalThis.InputPreset = {
  PATH: "input.json",

  save() {
    return File.write(this.PATH, json_stringify(Input.export()));
  },

  /** A missing file is a no-op; a malformed one is logged and skipped. */
  load() {
    const raw = File.read(this.PATH);
    if (raw === undefined) return false;
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (_) {
      data = null;
    }
    if (
      data === null ||
      typeof data.sensitivity !== "number" ||
      typeof data.deadzone !== "number" ||
      typeof data.rebinds !== "object" ||
      data.rebinds === null ||
      Array.isArray(data.rebinds) ||
      // a keycode is a plain number — a GML int64 constant lands as a tagged string (json_stringify)
      Object.keys(data.rebinds).some(
        (k) => typeof data.rebinds[k] !== "number",
      )
    ) {
      Log.warn("InputPreset: bad shape in " + this.PATH);
      return false;
    }
    Input.import(data);
    return true;
  },
};
