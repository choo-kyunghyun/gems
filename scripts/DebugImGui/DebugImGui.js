/**
 * DebugImGui — human front-end of the Debug registry via GameMaker's native
 * ImGui overlay (F3 to toggle). Renders OUTSIDE the game surface — screen_save
 * misses it; the agent uses debug.txt.
 *
 * Mirrors: ref_create needs (struct, "field") but entries are often getter fns
 * or class statics. Each entry gets a plain mirror `{ v }`; refresh() syncs
 * mirror↔binding each frame — read-only entries pull, editable entries
 * change-detect and push so external writes (e.g. Time.scale=0 on pause)
 * aren't clobbered by a stale slider.
 */
globalThis.DebugImGui = class DebugImGui {
  static _open = false;
  static _builtVersion = -1; // Debug.version() at last build
  // two windows rebuilt independently so entity picks don't move the stable
  // Debug window
  static _debugView = undefined;
  static _debugPanels = undefined; // panels the Debug view was built from
  static _debugMirrors = []; // [{ entry, mirror, last }]
  static _inspectView = undefined;
  static _inspectSection = undefined; // live section inside the Inspector view
  static _inspectPanel = null; // Entity panel at last rebuild
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

  // Step_0: F3 toggle; while open, rebuild on a registry change then sync
  // mirrors.
  static update() {
    if (!Debug.enabled) return;
    if (keyboard_check_pressed(vk_f3)) DebugImGui.toggle();
    if (!DebugImGui._open) return;
    if (DebugImGui._builtVersion !== Debug.version()) DebugImGui.build();
    DebugImGui.refresh();
  }

  static toggle() {
    DebugImGui._open = !DebugImGui._open;
    // drop fullscreen AA while open: native ImGui is single-sampled, so an
    // AA>0 back buffer fails with a fatal WebGPU sampleCount mismatch. Guarded
    // by AA>0 so the AA-off path doesn't reset.
    if (Settings.get("antialias") > 0) {
      Display.applyVideoWith(
        DebugImGui._open ? 0 : Settings.get("antialias"),
        Settings.get("vsync"),
      );
    }
    // minimised=true: collapse the built-in FPS window so it doesn't occlude
    // our views (the Perf panel already shows fps).
    show_debug_overlay(
      DebugImGui._open,
      true,
      DebugImGui._scale(),
      DebugImGui.alpha,
    );
  }

  static _scale() {
    if (DebugImGui.scale > 0) return DebugImGui.scale;
    return clamp(display_get_gui_height() / 900, 1.4, 3);
  }

  // rebuild only the window that changed — Debug when its panel set shifts,
  // Inspector when a new pick re-registers the Entity panel — so the Debug
  // window stays put.
  static build() {
    const panels = Debug.panels;
    let entity = null;
    const stable = [];
    for (let i = 0; i < panels.length; i++) {
      if (panels[i].name === "Entity") entity = panels[i];
      else stable.push(panels[i]);
    }

    if (!DebugImGui._sameRefs(stable, DebugImGui._debugPanels)) {
      const r = DebugImGui._buildView(
        DebugImGui._debugView,
        DebugImGui.title,
        DebugImGui.marginX,
        DebugImGui.marginY,
        stable,
      );
      DebugImGui._debugView = r.view;
      DebugImGui._debugMirrors = r.mirrors;
      DebugImGui._debugPanels = stable;
    }

    if (entity !== DebugImGui._inspectPanel) {
      DebugImGui._rebuildInspector(entity);
      DebugImGui._inspectPanel = entity;
    }

    DebugImGui._builtVersion = Debug.version();
  }

  // update the Inspector IN PLACE — keep the dbg_view alive, swap only the
  // section. No dbg_set_view on GMRT, so this relies on the Inspector view
  // staying the current one (nothing else creates a dbg_view after boot).
  // Tear the view down on deselect.
  static _rebuildInspector(entity) {
    if (entity === null) {
      if (
        DebugImGui._inspectView !== undefined &&
        dbg_view_exists(DebugImGui._inspectView)
      )
        dbg_view_delete(DebugImGui._inspectView);
      DebugImGui._inspectView = undefined;
      DebugImGui._inspectSection = undefined;
      DebugImGui._inspectMirrors = [];
      return;
    }

    if (
      DebugImGui._inspectView === undefined ||
      !dbg_view_exists(DebugImGui._inspectView)
    ) {
      DebugImGui._inspectView = dbg_view(
        "Inspector",
        true,
        DebugImGui.marginX + DebugImGui.viewW + 20,
        DebugImGui.marginY,
        DebugImGui.viewW,
        DebugImGui.inspectorH,
      );
      DebugImGui._inspectSection = undefined;
    }

    if (
      DebugImGui._inspectSection !== undefined &&
      dbg_section_exists(DebugImGui._inspectSection)
    )
      dbg_section_delete(DebugImGui._inspectSection);
    DebugImGui._inspectSection = dbg_section(entity.name, true);

    DebugImGui._inspectMirrors = [];
    const es = entity.entries;
    for (let j = 0; j < es.length; j++)
      DebugImGui._emit(es[j], DebugImGui._inspectMirrors);
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
      DebugImGui.headerH +
      panels.length * DebugImGui.sectionH +
      lines * DebugImGui.rowH;
    const view = dbg_view(title, true, x, y, DebugImGui.viewW, h);

    for (let i = 0; i < panels.length; i++) {
      dbg_section(panels[i].name, true);
      const es = panels[i].entries;
      for (let j = 0; j < es.length; j++) DebugImGui._emit(es[j], mirrors);
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
    // stays valid (refresh() mutates mirror.v in place).
    const v0 = Debug.read(entry);
    const mirror = { v: v0 };
    const ref = ref_create(mirror, "v");
    mirrors.push({ entry, mirror, last: v0 });

    if (entry.kind === "slider")
      dbg_slider(ref, entry.min, entry.max, entry.label, entry.step);
    else if (entry.kind === "checkbox") dbg_checkbox(ref, entry.label);
    else if (entry.kind === "dropdown")
      dbg_drop_down(ref, DebugImGui._spec(entry), entry.label);
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

  static refresh() {
    DebugImGui._sync(DebugImGui._debugMirrors);
    DebugImGui._sync(DebugImGui._inspectMirrors);
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
