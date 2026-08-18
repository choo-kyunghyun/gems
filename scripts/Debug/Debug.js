/**
 * Debug — a registry of debug sections rendered by GameMaker's native ImGui
 * overlay (F3). The overlay renders OUTSIDE the game surface, so screen_save
 * misses it — human-only at draw time; an agent tunes from a harness by
 * writing the same live state a control binds (e.g. Time.scale, the Game
 * object's requestStep()).
 *
 * A section is a duck-typed object { name, window?, scoped?, build(),
 * update()? } rendered as its own dbg_section; `window` names the dbg_view
 * hosting it (default "General") — a window's sections stack in registration
 * order. build() emits dbg_* controls (it may nest further dbg_sections — the
 * Inspector's per-component ones) and re-runs on Debug.refresh(name), so a
 * section whose content tracks live state republishes without re-registering;
 * the optional update() runs each frame while the overlay is open, for
 * whatever isn't a control. `scoped: true` ties the section to the live scene
 * — Game drops it at the scene boundary, so a scene never unregisters by hand.
 *
 * A control binds through ref_create, which needs a live plain object: ref one
 * directly where it exists (the Inspector's component structs — two-way, no
 * sync code), and route everything else — a class STATIC, a computed value —
 * through Debug.watch/checkbox, which stage a get/set pair behind a
 * hidden cell the update pass pumps: a read pulls, and an edit pushes only on
 * change, so an external write (Time.scale = 0 on pause) is never clobbered by
 * a stale control.
 *
 * Windows build LAZILY on first open (a bare dbg_view can raise the overlay,
 * and enabled = false must stay inert) and live until their sections are gone
 * — an F3 toggle hides, never rebuilds. No dbg_set_view on GMRT: dbg_section
 * lands in the most-recently-created dbg_view only, so any section change
 * (add/refresh/drop) takes its WHOLE window down for the lazy pass to rebuild —
 * a section that churns (the Inspector refreshes per pick) takes a window of
 * its own so the stable ones keep their dragged positions.
 */
/**
 * @typedef {{name: string, build: function(): void} & Object<string, *>}
 *   DebugSection
 * (the open record admits the optional members — window, scoped, update() —
 * plus the `_staged` bindings Debug attaches)
 */
globalThis.Debug = {
  enabled: true, // set false for a release build
  /** Registration order = stacking order in a window. */
  sections: [],

  _open: false,
  /** Window name -> its dbg_view handle. */
  _handles: {},
  /** the section whose build() is running — owner of the staged bindings. */
  _building: null,

  /**
   * register (or replace by name) a section; safe to re-call across scene
   * reloads. To republish an existing section's content, refresh() it.
   */
  add(section) {
    section._staged = [];
    Debug._invalidate(Debug._windowOf(section));
    for (let i = 0; i < Debug.sections.length; i++) {
      if (Debug.sections[i].name === section.name) {
        // old home, if it moved
        Debug._invalidate(Debug._windowOf(Debug.sections[i]));
        Debug.sections[i] = section;
        return section;
      }
    }
    Debug.sections.push(section);
    return section;
  },

  /**
   * re-run a registered section's build() on the next pass — how a section
   * whose content reads live state (the Inspector's selection, DebugRender's
   * pass list) republishes it. Unknown name = no-op, so a caller may refresh
   * before the owner has registered.
   */
  refresh(name) {
    for (let i = 0; i < Debug.sections.length; i++) {
      if (Debug.sections[i].name === name) {
        Debug._invalidate(Debug._windowOf(Debug.sections[i]));
        return;
      }
    }
  },

  /**
   * drop every `scoped` section — Game's scene boundary, alongside the other
   * per-scene global resets. A keep-switch suspends rather than destroys, so
   * it does NOT come through here: the frozen host keeps its sections and gets
   * them back on resume.
   */
  clearScoped() {
    for (let i = Debug.sections.length - 1; i >= 0; i--) {
      const section = Debug.sections[i];
      if (section.scoped === true) {
        Debug._invalidate(Debug._windowOf(section));
        Debug.sections.splice(i, 1);
      }
    }
  },

  /** build()-time: a read-only display of whatever `get` computes. */
  watch(label, get) {
    dbg_watch(Debug._stage(get, undefined), label);
  },

  /** build()-time: an editable checkbox over a get/set pair. */
  checkbox(label, get, set) {
    dbg_checkbox(Debug._stage(get, set), label);
  },

  /**
   * a ref to the hidden cell update() pumps against get/set. Stored read/write
   * — the `{ get }`/`{ set }` shorthand quirk (docs/GMRT.md).
   */
  _stage(get, set) {
    const cell = { v: get() };
    Debug._building._staged.push({ cell, read: get, write: set, last: cell.v });
    return ref_create(cell, "v");
  },

  _windowOf(section) {
    return section.window !== undefined ? section.window : "General";
  },

  /**
   * drop a window's dbg_view so the lazy pass rebuilds it (or lets it die
   * with its last section).
   */
  _invalidate(window) {
    const handle = Debug._handles[window];
    if (handle !== undefined && dbg_view_exists(handle))
      dbg_view_delete(handle);
    Debug._handles[window] = undefined;
  },

  /**
   * a method by house style, not a runtime dodge.
   */
  isOpen() {
    return Debug._open;
  },

  /**
   * Step_0: F3 toggle; while open, rebuild windows missing their dbg_view,
   * then pump every section's staged bindings and update().
   */
  update() {
    if (!Debug.enabled) return;
    if (keyboard_check_pressed(vk_f3)) Debug.toggle();
    if (!Debug._open) return;
    for (let i = 0; i < Debug.sections.length; i++) {
      const window = Debug._windowOf(Debug.sections[i]);
      const handle = Debug._handles[window];
      if (handle === undefined || !dbg_view_exists(handle))
        Debug._build(window);
    }
    for (let i = 0; i < Debug.sections.length; i++) {
      const section = Debug.sections[i];
      const staged = section._staged;
      for (let j = 0; j < staged.length; j++) {
        const b = staged[j];
        if (b.write !== undefined && b.cell.v !== b.last) b.write(b.cell.v);
        else b.cell.v = b.read();
        b.last = b.cell.v;
      }
      if (section.update !== undefined) section.update();
    }
  },

  toggle() {
    Debug._open = !Debug._open;
    // pin AA off for the overlay's whole lifetime (see Display.aaOverride): native ImGui is
    // single-sampled, so an AA>0 back buffer is a fatal WebGPU sampleCount mismatch. The reset
    // itself is guarded by AA>0 so the AA-off path doesn't reset.
    Display.aaOverride = Debug._open ? 0 : null;
    if (Settings.get("antialias") > 0) Display.applyVideo();
    // minimised=true: collapse the built-in FPS window so it doesn't occlude
    // our views (the Perf section already shows fps).
    show_debug_overlay(Debug._open, true);
  },

  /**
   * one dbg_view hosting every section of `window`.
   */
  _build(window) {
    Debug._handles[window] = dbg_view(window, true);
    for (let i = 0; i < Debug.sections.length; i++) {
      const section = Debug.sections[i];
      if (Debug._windowOf(section) === window) {
        dbg_section(section.name, true);
        section._staged = [];
        Debug._building = section;
        section.build();
        Debug._building = null;
      }
    }
  },
};
