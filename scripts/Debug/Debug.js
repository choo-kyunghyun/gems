/**
 * Debug back-end: a registry of named panels with live-bound entries. Read by
 * the DebugImGui human overlay (F3, outside the game surface so screen_save
 * misses it — human-only); agents can Debug.set/press a binding from a temp
 * harness. Built-in panels registered in Create_0.
 */
globalThis.Debug = class Debug {
  static enabled = true; // set false for a release build
  static panels = []; // [{ name, entries: [] }]
  static _version = 0; // bumped on registry change; front-ends rebuild on shift

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
        // (label, obj, key) field binding, or (label, getFn, setFn) computed
        // toggle.
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
        // "f"=real "i"=int "s"=string
        e.inputType = type === undefined ? "f" : type;
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

  // a method by house style — static getters are themselves safe on 0.20.
  static version() {
    return Debug._version;
  }

  // discriminate by whether `key` was passed, NOT typeof — a class like Time
  // is a function, so typeof-routing mis-routes (Time, "scale") into the
  // getter branch and calls Time() — crash.
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
};
