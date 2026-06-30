/**
 * File-IO persistence for the global Input keymap over Input.export()/import() (see Input).
 * load() replaces the whole keymap (Input.import clears actions first).
 *
 * GMRT's JSON.stringify hard-faults on nested objects/arrays (see CLAUDE.md), so the nested
 * binding lists are flattened to one scalar `actions` string → a flat { sensitivity, deadzone,
 * actions } that JSON round-trips safely. Encoding: actions ';'-joined, each `key=<buttons>#<axes>`,
 * each binding `f0,f1,device`, bindings '|'-joined (action keys never collide with the delimiters).
 */
globalThis.InputPreset = class InputPreset {
  static PATH = "input.json";

  /** @returns {boolean} whether the file was written. */
  static save() {
    return File.write(this.PATH, JSON.stringify(this._encode(Input.export())));
  }

  /** Load + apply the keymap; missing file or parse error is a no-op. @returns {boolean} applied. */
  static load() {
    const raw = File.read(this.PATH);
    if (raw === undefined) return false;
    try {
      Input.import(this._decode(JSON.parse(raw)));
      return true;
    } catch (_) {
      return false;
    }
  }

  /** Flatten the nested export blob to a JSON-safe flat object (binding lists → one scalar string). */
  static _encode(data) {
    const parts = [];
    const keys = Object.keys(data.actions);
    for (let i = 0; i < keys.length; i++) {
      const action = data.actions[keys[i]];
      const buttons = action.buttons
        .map((b) => b.source + "," + b.button + "," + b.device)
        .join("|");
      const axes = action.axes
        .map((a) => a.mode + "," + a.axis + "," + a.device)
        .join("|");
      parts.push(keys[i] + "=" + buttons + "#" + axes);
    }
    return {
      sensitivity: data.sensitivity,
      deadzone: data.deadzone,
      actions: parts.join(";"),
    };
  }

  /** Reverse _encode back into the nested shape Input.import() expects. */
  static _decode(parsed) {
    const actions = {};
    const blob = parsed.actions ?? "";
    if (blob.length > 0) {
      const entries = blob.split(";");
      for (let i = 0; i < entries.length; i++) {
        const eq = entries[i].indexOf("=");
        const key = entries[i].substring(0, eq);
        const groups = entries[i].substring(eq + 1).split("#");
        actions[key] = {
          buttons: this._decodeBindings(groups[0], "source", "button"),
          axes: this._decodeBindings(groups[1], "mode", "axis"),
        };
      }
    }
    return {
      sensitivity: parsed.sensitivity,
      deadzone: parsed.deadzone,
      actions: actions,
    };
  }

  /**
   * Parse a '|'-joined binding list (each `f0,f1,device`) into objects keyed by k0/k1 (3rd = device).
   * @param {string} str @param {string} k0 @param {string} k1 @returns {object[]}
   */
  static _decodeBindings(str, k0, k1) {
    const out = [];
    if (str === undefined || str.length === 0) return out;
    const items = str.split("|");
    for (let i = 0; i < items.length; i++) {
      const f = items[i].split(",");
      const o = {};
      o[k0] = Number(f[0]);
      o[k1] = Number(f[1]);
      o.device = Number(f[2]);
      out.push(o);
    }
    return out;
  }
};
