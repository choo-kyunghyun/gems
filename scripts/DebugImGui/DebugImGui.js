/**
 * DebugImGui — the HUMAN front-end of the debug system: renders the `Debug`
 * back-end registry through GameMaker's native ImGui overlay (show_debug_overlay
 * + dbg_view / dbg_section / dbg_* widgets + ref_create). It holds no state of
 * its own beyond the view handles and per-entry mirrors — `Debug` is the single
 * source of truth (the text port writes the same registry to debug.txt).
 *
 * The overlay renders OUTSIDE the game surface, so an AI agent can't see it
 * (screen_save misses it; is_debug_overlay_open() misreports) — this port is for
 * a human at the keyboard. Toggle with F3.
 *
 * Binding model — why mirrors: ref_create needs a (struct, "field") pair, but a
 * Debug entry's value is often a getter fn (`() => fps`) or targets a class
 * static (`(Time, "scale")`) that ref_create may not accept. So each entry gets
 * a plain MIRROR struct `{ v }` (a plain object always ref_create-able), the
 * widget is ref_create'd to the mirror, and refresh() syncs mirror <-> binding
 * each frame:
 *   - read-only (watch/text): pull   mirror.v = Debug.read(entry)
 *   - editable (slider/checkbox/dropdown): change-detected push — if the overlay
 *     moved mirror.v since the last sync, write it back through the binding;
 *     otherwise pull. Comparing against the last SYNCED value (not the live one)
 *     means an external write (e.g. SystemMenu setting Time.scale = 0 on pause)
 *     is pulled in, not clobbered by the stale slider value.
 *
 * Wiring: DebugImGui.update() in obj_game Step_0 (after Debug.update()).
 */
globalThis.DebugImGui = class DebugImGui {
  static _open = false;
  static _builtVersion = -1; // Debug.version() the views were last built at
  // Two windows, rebuilt INDEPENDENTLY so a frequent change in one doesn't reset
  // the other's position: "Debug" holds the stable panels (Time/Perf as sections);
  // "Inspector" holds the dynamic Entity panel (re-registered on every pick).
  static _debugView = undefined;
  static _debugPanels = undefined; // stable panel objects the Debug view was built from
  static _debugMirrors = []; // [{ entry, mirror, last }]
  static _inspectView = undefined;
  static _inspectSection = undefined; // the live section inside the Inspector view
  static _inspectPanel = null; // the Entity panel object the Inspector was built from
  static _inspectMirrors = [];

  // Overlay rendering. scale = -1 auto-derives a DPI-aware factor from the GUI
  // height; default 1 (the GameMaker default) since a larger scale magnifies the
  // label text and, in a fixed-width window, starves the control column (the
  // dbg_* widgets use a fixed two-column label|control grid with no API to set
  // the split — the only lever for control width is the window width below).
  static scale = 1;
  static alpha = 0.95;

  // Window layout (px). Explicit position keeps views off the right edge; the
  // width must be comfortably WIDER than ImGui's 500 default so that, after the
  // label column takes its share of the two-column grid, the control half is
  // still wide enough to drag a slider.
  static title = "Debug"; // the single dbg_view window title
  static marginX = 24;
  static marginY = 72; // clear the menu bar + the minimised built-in FPS header
  static viewW = 620;
  static headerH = 44; // view title bar + padding
  static sectionH = 34; // per-panel collapsing section header
  static rowH = 30; // per-entry row
  static inspectorH = 460; // Inspector view height (fixed; content scrolls)

  // Step_0: handle the F3 toggle and, while open, rebuild on a registry change
  // (e.g. the inspector (re)registering the Entity panel) then sync the mirrors.
  static update() {
    if (!Debug.enabled) return;
    if (keyboard_check_pressed(vk_f3)) DebugImGui.toggle();
    if (!DebugImGui._open) return;
    if (DebugImGui._builtVersion !== Debug.version()) DebugImGui.build();
    DebugImGui.refresh();
  }

  static toggle() {
    DebugImGui._open = !DebugImGui._open;
    // minimised = true: open the built-in FPS window collapsed to a thin header.
    // Left expanded it covers the top-left (where our custom views sit) with its
    // graphs, occluding the label side of every row. The Perf panel already
    // surfaces fps, so the graph isn't needed; the user can expand it if wanted.
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

  // Rebuild the two windows, but only the one that actually changed: the Debug
  // window when the stable panel set shifts, the Inspector window when the Entity
  // panel is re-registered (a new pick → a fresh panel object). This keeps the
  // Debug window put while you click around picking entities.
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

  // Update the Inspector window IN PLACE: keep the dbg_view alive (so it keeps its
  // position as you pick around) and only swap the section's contents. There's no
  // dbg_set_view on GMRT, so we rely on the Inspector view being the current one:
  // it's created once here and nothing else creates a dbg_view afterward (the
  // stable Debug view is built once at boot), so the current view stays this one
  // across picks and the new section lands in it. Tear the view down on deselect.
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

  // (Re)create one dbg_view holding the given panels as explicit dbg_sections
  // (without a section GM auto-creates a "Default" one and the first control
  // bleeds onto its header). Returns { view, mirrors }; view is undefined for an
  // empty panel list. Deletes the prior handle first.
  static _buildView(oldView, title, x, y, panels) {
    if (oldView !== undefined && dbg_view_exists(oldView))
      dbg_view_delete(oldView);
    const mirrors = [];
    if (panels.length === 0) return { view: undefined, mirrors };

    let lines = 0; // one row per entry (labelled two-column widgets)
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
    // A static text label (no getter) needs no live ref.
    if (entry.kind === "text" && entry.get === undefined) {
      dbg_text(entry.label);
      return;
    }

    // Live value -> plain mirror -> ref (the mirror is never replaced, so the
    // ref stays valid; refresh() mutates mirror.v in place). The labelled dbg_*
    // widgets render as proper two-column label|control rows now that each panel
    // has its own dbg_section.
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

  // dbg_drop_down specifier: "Name:value,Name2:value2" from options [{value,name}].
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
        // The overlay moved the value since the last sync -> push it through.
        Debug.write(e, m.mirror.v);
        m.last = m.mirror.v;
      } else {
        // Unchanged by the user -> pull (also reflects external writes).
        m.mirror.v = live;
        m.last = live;
      }
    }
  }
};
