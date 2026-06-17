/**
 * File-IO persistence for the global Input keymap — the save/load layer over
 * Input.export()/Input.import() that those methods were scaffolded for (see Input).
 * Controllers register a keymap per scene via Input.bindAll; call save() after a
 * rebind to persist it and load() to restore a user's bindings (load() replaces
 * the whole keymap, since Input.import clears actions first).
 *
 * Input.export() is a deeply nested blob ({ actions: { key: { buttons:[…], axes:[…] } } })
 * and GMRT's JSON.stringify hard-faults on any nested object/array (see CLAUDE.md), so the
 * binding lists are flattened to a single scalar `actions` string; the persisted object is
 * then flat { sensitivity, deadzone, actions } (all scalars), which JSON round-trips safely
 * as Settings/SaveData do. Encoding: actions joined by ';', each `key=<buttons>#<axes>`,
 * each binding `f0,f1,device`, bindings joined by '|' (action keys are plain identifiers,
 * so they never collide with the delimiters).
 */
globalThis.InputPreset = class InputPreset {
  static PATH = "input.json";

  /** Serialize the live keymap (Input.export()) to PATH. @returns {boolean} whether the file was written. */
  static save() {
    return File.write(this.PATH, JSON.stringify(this._encode(Input.export())));
  }

  /**
   * Load the keymap from PATH and apply it via Input.import (replacing all actions).
   * Missing file or parse error is a no-op.
   * @returns {boolean} whether a keymap was applied.
   */
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

  /**
   * Flatten Input.export()'s nested blob to a JSON-safe flat object — the binding lists
   * collapse into one `actions` string so no persisted value is a nested object/array.
   * @param {{sensitivity:number,deadzone:number,actions:object}} data
   * @returns {{sensitivity:number,deadzone:number,actions:string}}
   */
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

  /**
   * Reverse _encode back into the nested shape Input.import() expects.
   * @param {{sensitivity:number,deadzone:number,actions:string}} parsed
   * @returns {{sensitivity:number,deadzone:number,actions:object}}
   */
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
   * Parse a '|'-joined binding list (each `f0,f1,device`) into objects keyed by the given
   * field names (buttons → source/button, axes → mode/axis; the 3rd field is always device).
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
