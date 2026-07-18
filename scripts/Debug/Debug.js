/**
 * Debug — named panels of live-bound entries, rendered by GameMaker's native
 * ImGui overlay (F3). The overlay renders OUTSIDE the game surface, so
 * screen_save misses it — human-only at draw time; an agent tunes through
 * Debug.set/press from a harness instead. Built-in panels registered in
 * Create_0; panel() is safe to re-call across scene reloads.
 *
 * Mirrors: ref_create needs (struct, "field") but entries are often getter fns
 * or class statics. Each entry gets a plain mirror `{ v }`; _sync() runs each
 * frame while open — read-only entries pull, editable entries change-detect
 * and push so external writes (e.g. Time.scale=0 on pause) aren't clobbered
 * by a stale slider.
 */
globalThis.Debug = class Debug {
  static enabled = true; // set false for a release build
  static panels = []; // [{ name, window, entries: [] }]
  static _dirty = true; // registry changed since the last _build()

  static _open = false;
  // two windows rebuilt independently so entity picks don't move the stable
  // Debug window: the main view recreates on a registry shift; the Inspector
  // view swaps its section in place (no dbg_set_view on GMRT — the view stays
  // alive so a re-pick keeps its dragged position).
  static _debugView = undefined;
  static _debugPanels = undefined; // panels the main view was built from
  static _debugMirrors = []; // [{ entry, mirror, last }]
  static _inspectView = undefined;
  static _inspectSection = undefined; // live section inside the Inspector view
  static _inspectPanel = null; // Inspector-docked panel at last rebuild
  static _inspectMirrors = [];

  // scale=-1 auto-derives the DPI factor from GUI height; 1 is the default —
  // a larger scale starves the control column (fixed two-column grid, no API
  // to adjust the split).
  static scale = 1;
  static alpha = 0.95;

  // explicit position + generous width so the control half of the
  // label|control grid stays dragable.
  static title = "Debug";
  static marginX = 24;
  static marginY = 72; // clear the menu bar + minimised built-in FPS header
  static viewW = 620;
  static headerH = 44; // view title bar + padding
  static sectionH = 34; // per-panel section header
  static rowH = 30; // per-entry row
  static inspectorH = 460; // Inspector view height (fixed; content scrolls)

  // register (or replace) a named panel; safe to re-call across scene reloads.
  // opts.window === "Inspector" docks the panel in the Inspector view — at
  // most one panel docks there (its section is swapped in place; see the
  // window split above).
  static panel(name, builder, opts) {
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

    const panel = {
      name,
      window: opts !== undefined ? opts.window : undefined,
      entries,
    };
    Debug._dirty = true;
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
        Debug._dirty = true;
        return;
      }
    }
  }

  static clear() {
    Debug.panels = [];
    Debug._dirty = true;
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

  // a method by house style — static getters are themselves safe on 0.20.
  static isOpen() {
    return Debug._open;
  }

  // Step_0: F3 toggle; while open, rebuild on a registry change then sync
  // mirrors.
  static update() {
    if (!Debug.enabled) return;
    if (keyboard_check_pressed(vk_f3)) Debug.toggle();
    if (!Debug._open) return;
    if (Debug._dirty) Debug._build();
    Debug._sync(Debug._debugMirrors);
    Debug._sync(Debug._inspectMirrors);
  }

  static toggle() {
    Debug._open = !Debug._open;
    // drop fullscreen AA while open: native ImGui is single-sampled, so an
    // AA>0 back buffer fails with a fatal WebGPU sampleCount mismatch. Guarded
    // by AA>0 so the AA-off path doesn't reset.
    if (Settings.get("antialias") > 0) {
      Display.applyVideoWith(
        Debug._open ? 0 : Settings.get("antialias"),
        Settings.get("vsync"),
      );
    }
    // minimised=true: collapse the built-in FPS window so it doesn't occlude
    // our views (the Perf panel already shows fps).
    show_debug_overlay(Debug._open, true, Debug._scale(), Debug.alpha);
  }

  static _scale() {
    if (Debug.scale > 0) return Debug.scale;
    return clamp(display_get_gui_height() / 900, 1.4, 3);
  }

  // rebuild only the window that changed — the main view when its panel set
  // shifts, the Inspector when its docked panel re-registers — so the main
  // view stays put.
  static _build() {
    const panels = Debug.panels;
    let inspect = null;
    const stable = [];
    for (let i = 0; i < panels.length; i++) {
      if (panels[i].window === "Inspector") inspect = panels[i];
      else stable.push(panels[i]);
    }

    if (!Debug._sameRefs(stable, Debug._debugPanels)) {
      const r = Debug._buildView(
        Debug._debugView,
        Debug.title,
        Debug.marginX,
        Debug.marginY,
        stable,
      );
      Debug._debugView = r.view;
      Debug._debugMirrors = r.mirrors;
      Debug._debugPanels = stable;
    }

    if (inspect !== Debug._inspectPanel) {
      Debug._rebuildInspector(inspect);
      Debug._inspectPanel = inspect;
    }

    Debug._dirty = false;
  }

  // update the Inspector IN PLACE — keep the dbg_view alive, swap only the
  // section. No dbg_set_view on GMRT, so this relies on the Inspector view
  // staying the current one (nothing else creates a dbg_view after boot).
  // Tear the view down on deselect.
  static _rebuildInspector(panel) {
    if (panel === null) {
      if (
        Debug._inspectView !== undefined &&
        dbg_view_exists(Debug._inspectView)
      )
        dbg_view_delete(Debug._inspectView);
      Debug._inspectView = undefined;
      Debug._inspectSection = undefined;
      Debug._inspectMirrors = [];
      return;
    }

    if (
      Debug._inspectView === undefined ||
      !dbg_view_exists(Debug._inspectView)
    ) {
      Debug._inspectView = dbg_view(
        "Inspector",
        true,
        Debug.marginX + Debug.viewW + 20,
        Debug.marginY,
        Debug.viewW,
        Debug.inspectorH,
      );
      Debug._inspectSection = undefined;
    }

    if (
      Debug._inspectSection !== undefined &&
      dbg_section_exists(Debug._inspectSection)
    )
      dbg_section_delete(Debug._inspectSection);
    Debug._inspectSection = dbg_section(panel.name, true);

    Debug._inspectMirrors = [];
    const es = panel.entries;
    for (let j = 0; j < es.length; j++)
      Debug._emit(es[j], Debug._inspectMirrors);
  }

  // (re)create one dbg_view with each panel as an explicit dbg_section —
  // without one GM auto-makes a "Default" section and the first control bleeds
  // onto its header. Deletes the prior handle.
  static _buildView(oldView, title, x, y, panels) {
    if (oldView !== undefined && dbg_view_exists(oldView))
      dbg_view_delete(oldView);
    const mirrors = [];
    if (panels.length === 0) return { view: undefined, mirrors };

    let lines = 0; // one row per entry
    for (let i = 0; i < panels.length; i++) lines += panels[i].entries.length;
    const h =
      Debug.headerH + panels.length * Debug.sectionH + lines * Debug.rowH;
    const view = dbg_view(title, true, x, y, Debug.viewW, h);

    for (let i = 0; i < panels.length; i++) {
      dbg_section(panels[i].name, true);
      const es = panels[i].entries;
      for (let j = 0; j < es.length; j++) Debug._emit(es[j], mirrors);
    }
    return { view, mirrors };
  }

  static _sameRefs(a, b) {
    if (b === undefined || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  static _emit(entry, mirrors) {
    if (entry.kind === "button") {
      dbg_button(entry.label, entry.fn);
      return;
    }
    // static text (no getter) needs no live ref.
    if (entry.kind === "text" && entry.get === undefined) {
      dbg_text(entry.label);
      return;
    }

    // live value -> mirror -> ref; the mirror is never replaced so the ref
    // stays valid (_sync() mutates mirror.v in place).
    const v0 = Debug.read(entry);
    const mirror = { v: v0 };
    const ref = ref_create(mirror, "v");
    mirrors.push({ entry, mirror, last: v0 });

    if (entry.kind === "slider")
      dbg_slider(ref, entry.min, entry.max, entry.label, entry.step);
    else if (entry.kind === "checkbox") dbg_checkbox(ref, entry.label);
    else if (entry.kind === "dropdown")
      dbg_drop_down(ref, Debug._spec(entry), entry.label);
    else if (entry.kind === "input")
      dbg_text_input(ref, entry.label, entry.inputType);
    else if (entry.kind === "text") dbg_text(ref);
    else dbg_watch(ref, entry.label); // watch + any fallback
  }

  // dbg_drop_down specifier: "Name:value,Name2:value2" from options
  // [{value,name}].
  static _spec(entry) {
    let s = "";
    const opts = entry.options;
    for (let i = 0; i < opts.length; i++) {
      if (i > 0) s += ",";
      s += opts[i].name + ":" + opts[i].value;
    }
    return s;
  }

  static _sync(ms) {
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      const e = m.entry;
      const live = Debug.read(e);
      const editable =
        e.kind === "slider" ||
        e.kind === "checkbox" ||
        e.kind === "dropdown" ||
        e.kind === "input";
      if (editable && m.mirror.v !== m.last) {
        // overlay moved it since last sync -> push through the binding.
        Debug.write(e, m.mirror.v);
        m.last = m.mirror.v;
      } else {
        // unchanged by user -> pull (reflects external writes).
        m.mirror.v = live;
        m.last = live;
      }
    }
  }
};
