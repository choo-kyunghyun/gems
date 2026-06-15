/**
 * Debug — the BACK-END of the debug system: a registry of named panels, each
 * holding live-bound entries (watch / slider / checkbox / dropdown / button /
 * text). It does NOT render. Two FRONT-ENDS consume this same registry:
 *
 *   - ImGui (dbg_*) — human-facing native overlay [Phase 2]. It works on GMRT
 *     0.20, but renders OUTSIDE the game surface, so screen_save can't capture
 *     it and is_debug_overlay_open() misreports — an AI agent can't see it.
 *   - Text dump (Debug.dump -> debug.txt) — agent-facing. The same registry
 *     serialized to a flat text file the agent can Read after a run.
 *
 * An entry's value is a LIVE binding, never a cached copy: either (obj, key)
 * — read/write obj[key] — or a getter function (read-only). Both front-ends
 * read the value live, and Debug.set(panel, label, value) / Debug.press(...)
 * write/trigger through it, so an agent can tune a value or fire a button and
 * then verify the effect on the game surface (which it CAN screenshot).
 *
 * A panel is plain data: { name, entries: [descriptor] }. The builder passed to
 * Debug.panel() is a transient plain object of emit closures (no class, so no
 * 50-method-ceiling concern). Register a panel once; bindings stay live.
 *
 * Wiring: Debug.update() in obj_game Step_0 (periodic text dump); built-in
 * panels (Time / Perf) registered in obj_game Create_0.
 */
globalThis.Debug = class Debug {
  static enabled = true; // master gate (a dev tool — set false for a release build)
  static panels = []; // [{ name, entries: [] }]
  static dumpFile = "debug.txt"; // bare name -> save dir, next to game.log
  static dumpInterval = 30; // frames between automatic text dumps
  static _frame = 0;

  // Register (or replace) a named panel. `builder(p)` populates it with live-
  // bound entries via p.watch / p.slider / p.checkbox / p.dropdown / p.button /
  // p.text. Re-registering the same name replaces it (safe across scene reloads).
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
      checkbox: (label, obj, key) => {
        entries.push(Debug._mk("checkbox", label, obj, key));
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
        return;
      }
    }
  }

  static clear() {
    Debug.panels = [];
  }

  // A descriptor is (obj, key) when a key is given, or a getter fn otherwise.
  // The discriminator is whether `key` was passed — NOT typeof objOrFn, since a
  // class (e.g. Time) is itself a function, which would mis-route (Time, "scale")
  // into the getter branch and later call Time() — a hard crash.
  static _mk(kind, label, objOrFn, key) {
    const e = { kind, label };
    if (key === undefined) e.get = objOrFn;
    else {
      e.obj = objOrFn;
      e.key = key;
    }
    return e;
  }

  // ── Live read / write through a binding ───────────────────────────────────
  static read(entry) {
    if (entry.get !== undefined) return entry.get();
    if (entry.obj !== undefined && entry.obj !== null)
      return entry.obj[entry.key];
    return undefined;
  }

  static write(entry, value) {
    if (entry.obj !== undefined && entry.obj !== null) {
      entry.obj[entry.key] = value;
      return true;
    }
    return false; // getter-only entries (watch/text) are read-only
  }

  // ── Agent-facing control (call from a temp harness, or wire to a hotkey) ──
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

  // ── Text front-end (agent) ────────────────────────────────────────────────
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
    if (e.kind === "text" && e.get === undefined) return e.label; // static note
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

  // Write the live snapshot to disk for the agent to Read. Returns the string.
  static dump() {
    const s = Debug.snapshot();
    File.write(Debug.dumpFile, s);
    return s;
  }

  // Step_0: periodically refresh debug.txt so the agent's snapshot stays current.
  static update() {
    if (!Debug.enabled || Debug.panels.length === 0) return;
    Debug._frame++;
    if (Debug._frame >= Debug.dumpInterval) {
      Debug._frame = 0;
      Debug.dump();
    }
  }
};
