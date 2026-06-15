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
  static _built = false;
  static _views = []; // dbg_view handles, for teardown on rebuild
  static _mirrors = []; // [{ entry, mirror, last }]

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
  static marginX = 24;
  static marginY = 72; // clear the menu bar + the minimised built-in FPS header
  static viewW = 620;
  static gap = 16;
  static headerH = 44; // title bar + padding
  static rowH = 30; // per-entry row

  // Step_0: handle the F3 toggle and, while open, keep the mirrors in sync.
  static update() {
    if (!Debug.enabled) return;
    if (keyboard_check_pressed(vk_f3)) DebugImGui.toggle();
    if (!DebugImGui._open) return;
    if (!DebugImGui._built) DebugImGui.build();
    DebugImGui.refresh();
  }

  static toggle() {
    DebugImGui._open = !DebugImGui._open;
    if (DebugImGui._open && !DebugImGui._built) DebugImGui.build();
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

  // (Re)create one dbg_view per panel and a mirror + widget per entry. Call again
  // to rebuild after the registry changes (e.g. a panel re-registers). Views are
  // stacked in a left-hand column, each sized to its content.
  static build() {
    for (let i = 0; i < DebugImGui._views.length; i++) {
      const v = DebugImGui._views[i];
      if (dbg_view_exists(v)) dbg_view_delete(v);
    }
    DebugImGui._views = [];
    DebugImGui._mirrors = [];

    let y = DebugImGui.marginY;
    const panels = Debug.panels;
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i];
      // A slider takes two lines (its name sits above the full-width track).
      let lines = 0;
      for (let j = 0; j < p.entries.length; j++)
        lines += p.entries[j].kind === "slider" ? 2 : 1;
      const h = DebugImGui.headerH + lines * DebugImGui.rowH;
      DebugImGui._views.push(
        dbg_view(p.name, true, DebugImGui.marginX, y, DebugImGui.viewW, h),
      );
      y += h + DebugImGui.gap;
      for (let j = 0; j < p.entries.length; j++) DebugImGui._emit(p.entries[j]);
    }
    DebugImGui._built = true;
  }

  static _emit(entry) {
    if (entry.kind === "button") {
      dbg_button(entry.label, entry.fn);
      return;
    }

    // Editable widgets need their two-column control.
    if (
      entry.kind === "slider" ||
      entry.kind === "checkbox" ||
      entry.kind === "dropdown"
    ) {
      const v0 = Debug.read(entry);
      const mirror = { v: v0 };
      const ref = ref_create(mirror, "v");
      DebugImGui._mirrors.push({ entry, mirror, last: v0, str: false });
      if (entry.kind === "slider") {
        // An empty label lets the slider take the full content width; a labelled
        // slider is crushed into the narrow right-hand control column. Put the
        // name on its own line above it instead.
        dbg_text(entry.label);
        dbg_slider(ref, entry.min, entry.max, "", entry.step);
      } else if (entry.kind === "checkbox") dbg_checkbox(ref, entry.label);
      else dbg_drop_down(ref, DebugImGui._spec(entry), entry.label);
      return;
    }

    // Everything else (watch / text) -> full-width single-column dbg_text. The
    // two-column label|control widgets starve the value column to a sliver on the
    // right (truncating values, e.g. "Lobby" -> "Lobb") with no API to set the
    // split, so read-only rows render as one formatted line (text-port format).
    const str0 = Debug._line(entry);
    const mirror = { v: str0 };
    DebugImGui._mirrors.push({ entry, mirror, last: str0, str: true });
    dbg_text(ref_create(mirror, "v"));
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
    const ms = DebugImGui._mirrors;
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i];
      if (m.str) {
        // Read-only text row: re-render the formatted line each frame.
        m.mirror.v = Debug._line(m.entry);
        continue;
      }
      const e = m.entry;
      const live = Debug.read(e);
      if (m.mirror.v !== m.last) {
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
