/**
 * File persistence for the player input profile: sensitivity, deadzone, keyboard rebinds. Loaded
 * at boot over the registered keymap.
 *
 * BUG: serialized with json_stringify, since JSON.stringify faults on the nesting; JSON.parse is
 * fine (docs/GMRT.md #15565).
 */
globalThis.InputPreset = {
  PATH: "input.json",

  save() {
    File.write(InputPreset.PATH, json_stringify(Input.export()));
  },

  /** A missing file is a no-op; a malformed one is logged and skipped. */
  load() {
    const raw = File.read(InputPreset.PATH);
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
      // a keycode must be a plain number, not the tagged string an int64 constant serializes to
      Object.keys(data.rebinds).some(
        (k) => typeof data.rebinds[k] !== "number",
      )
    ) {
      Log.warn("InputPreset: bad shape in " + InputPreset.PATH);
      return false;
    }
    Input.import(data);
    return true;
  },
};
