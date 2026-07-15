/**
 * Debug back-end: a registry of named panels with live-bound entries. Two front-ends
 * read the same registry — DebugImGui (human, F3 overlay, outside game surface so
 * screen_save misses it) and a text dump to debug.txt (agent-readable after a run).
 * Wired: Debug.update() in Step_0; built-in panels registered in Create_0.
 */
globalThis.Debug = class Debug {
  static enabled = true; // set false for a release build
  static panels = []; // [{ name, entries: [] }]
  static dumpFile = "debug.txt"; // bare name -> save dir, next to game.log
  static dumpInterval = 30; // frames between automatic text dumps
  static _frame = 0;
  static _version = 0; // bumped on registry change; front-ends rebuild when it shifts

  // register (or replace) a named panel; safe to re-call across scene reloads.
  static panel(name, builder) {
    const entries = [];
    const p = {
      watch: (label, objOrFn, key) => {
        entries.push(Debug._mk("watch", label, objOrFn, key));
        return p;
      },
      slider: (label, obj, key, min, max, step) => {
        const e = Debug._mk("slider", label, obj, key);
        e.min = min;
        e.max = max;
        e.step = step === undefined ? 1 : step;
        entries.push(e);
        return p;
      },
      checkbox: (label, a, b) => {
        // (label, obj, key) field binding, or (label, getFn, setFn) computed toggle.
        const e = { kind: "checkbox", label };
        if (typeof b === "function") {
          e.get = a;
          e.set = b;
        } else {
          e.obj = a;
          e.key = b;
        }
        entries.push(e);
        return p;
      },
      input: (label, obj, key, type) => {
        const e = Debug._mk("input", label, obj, key);
        e.inputType = type === undefined ? "f" : type; // "f"=real "i"=int "s"=string
        entries.push(e);
        return p;
      },
      dropdown: (label, obj, key, options) => {
        const e = Debug._mk("dropdown", label, obj, key);
        e.options = options; // [{ value, name }]
        entries.push(e);
        return p;
      },
      button: (label, fn) => {
        entries.push({ kind: "button", label, fn });
        return p;
      },
      text: (label, fn) => {
        const e = { kind: "text", label };
        if (typeof fn === "function") e.get = fn;
        entries.push(e);
        return p;
      },
    };
    builder(p);

    const panel = { name, entries };
    Debug._version++;
    for (let i = 0; i < Debug.panels.length; i++) {
      if (Debug.panels[i].name === name) {
        Debug.panels[i] = panel;
        return panel;
      }
    }
    Debug.panels.push(panel);
    return panel;
  }

  static remove(name) {
    for (let i = 0; i < Debug.panels.length; i++) {
      if (Debug.panels[i].name === name) {
        Debug.panels.splice(i, 1);
        Debug._version++;
        return;
      }
    }
  }

  static clear() {
    Debug.panels = [];
    Debug._version++;
  }

  // a method, not a static getter — house style; static getters are safe on 0.20 (2026-07 re-audit).
  static version() {
    return Debug._version;
  }

  // discriminate by whether `key` was passed, NOT typeof — a class like Time is a function,
  // so typeof-routing mis-routes (Time, "scale") into the getter branch and calls Time() — crash.
  static _mk(kind, label, objOrFn, key) {
    const e = { kind, label };
    if (key === undefined) e.get = objOrFn;
    else {
      e.obj = objOrFn;
      e.key = key;
    }
    return e;
  }

  // Live read / write through a binding
  static read(entry) {
    if (entry.get !== undefined) return entry.get();
    if (entry.obj !== undefined && entry.obj !== null)
      return entry.obj[entry.key];
    return undefined;
  }

  static write(entry, value) {
    if (entry.set !== undefined) {
      entry.set(value);
      return true;
    }
    if (entry.obj !== undefined && entry.obj !== null) {
      entry.obj[entry.key] = value;
      return true;
    }
    return false; // watch/text entries are read-only
  }

  // Agent-facing control
  static set(panelName, label, value) {
    const e = Debug._find(panelName, label);
    return e !== null ? Debug.write(e, value) : false;
  }

  static press(panelName, label) {
    const e = Debug._find(panelName, label);
    if (e !== null && e.kind === "button" && e.fn !== undefined) {
      e.fn();
      return true;
    }
    return false;
  }

  static _find(panelName, label) {
    for (let i = 0; i < Debug.panels.length; i++) {
      const p = Debug.panels[i];
      if (p.name !== panelName) continue;
      for (let j = 0; j < p.entries.length; j++) {
        if (p.entries[j].label === label) return p.entries[j];
      }
    }
    return null;
  }

  // Text front-end (agent)
  static snapshot() {
    let out = "";
    for (let i = 0; i < Debug.panels.length; i++) {
      const p = Debug.panels[i];
      out += "[" + p.name + "]\n";
      for (let j = 0; j < p.entries.length; j++) {
        out += "  " + Debug._line(p.entries[j]) + "\n";
      }
      out += "\n";
    }
    return out;
  }

  static _line(e) {
    if (e.kind === "button") return e.label + " : <button>";
    if (e.kind === "text" && e.get === undefined) return e.label; // static label, no value
    const v = Debug.read(e);
    if (e.kind === "dropdown") return e.label + " = " + Debug._optName(e, v);
    return e.label + " = " + Debug._fmt(v);
  }

  static _optName(e, v) {
    if (e.options !== undefined) {
      for (let i = 0; i < e.options.length; i++) {
        if (e.options[i].value === v)
          return e.options[i].name + " (" + Debug._fmt(v) + ")";
      }
    }
    return Debug._fmt(v);
  }

  static _fmt(v) {
    if (v === undefined) return "undefined";
    if (v === null) return "null";
    if (typeof v === "number") return String(Math.round(v * 1000) / 1000);
    if (typeof v === "boolean") return v ? "true" : "false";
    return String(v);
  }

  // write live snapshot to debug.txt for the agent to Read.
  static dump() {
    const s = Debug.snapshot();
    File.write(Debug.dumpFile, s);
    return s;
  }

  // Step_0: periodic text dump so the agent's snapshot stays current.
  static update() {
    if (!Debug.enabled || Debug.panels.length === 0) return;
    Debug._frame++;
    if (Debug._frame >= Debug.dumpInterval) {
      Debug._frame = 0;
      Debug.dump();
    }
  }
};
