/**
 * Debug — a registry of debug sections rendered by GameMaker's native ImGui
 * overlay (F3). The overlay renders OUTSIDE the game surface, so screen_save
 * misses it — human-only at draw time; an agent tunes from a harness by
 * writing the same live state a control binds (e.g. Time.scale,
 * game.scenes.requestStep()) or a section's staged `data` field.
 *
 * A section is a duck-typed object { name, window?, build(), update()?,
 * data? } rendered as its own dbg_section; `window` names the dbg_view
 * window hosting it (default "General") — a window's sections stack in
 * registration order. The manager opens the dbg_section, then build() emits
 * dbg_* controls (it may nest further dbg_sections — the Inspector's
 * per-component ones); update() runs each frame while the overlay is open.
 * Controls bind through ref_create — directly at a live plain object where
 * one exists (two-way, no sync code); a class STATIC or computed value can't
 * be ref'd, so it stages through the section's plain `data` struct: update()
 * pulls reads (data.fps = fps) and, for editable fields,
 * change-detect-pushes so external writes (e.g. Time.scale = 0 on pause)
 * aren't clobbered by a stale control.
 *
 * Windows build LAZILY on first open (a bare dbg_view can raise the overlay,
 * and enabled = false must stay inert) and live until their sections are
 * gone — an F3 toggle hides, never rebuilds. No dbg_set_view on GMRT:
 * dbg_section lands in the most-recently-created dbg_view only, so any
 * section change (add/re-add/remove) drops its WHOLE window for the lazy
 * pass to rebuild — a section that churns (the Inspector re-registers per
 * pick) takes a window of its own so the stable ones keep their dragged
 * positions.
 */
/**
 * @typedef {{name: string, build: function(): void} & Object<string, *>}
 *   DebugSection
 * (the open record admits the optional members — window, update(), data —
 * and any per-section staging state: `_last`, …)
 */
globalThis.Debug = class Debug {
  static enabled = true; // set false for a release build
  /** @type {DebugSection[]} registration order = stacking order in a window */
  static sections = [];

  static _open = false;
  /** @type {Object<string, *>} window name -> its dbg_view handle */
  static _handles = {};

  /**
   * register (or replace by name) a section; safe to re-call across scene
   * reloads — re-add()ing is also how a section refreshes its own content.
   * @param {DebugSection} section
   */
  static add(section) {
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
  }

  static remove(name) {
    for (let i = 0; i < Debug.sections.length; i++) {
      if (Debug.sections[i].name === name) {
        Debug._invalidate(Debug._windowOf(Debug.sections[i]));
        Debug.sections.splice(i, 1);
        return;
      }
    }
  }

  /** @param {DebugSection} section */
  static _windowOf(section) {
    return section.window !== undefined ? section.window : "General";
  }

  /**
   * drop a window's dbg_view so the lazy pass rebuilds it (or lets it die
   * with its last section).
   * @param {string} window
   */
  static _invalidate(window) {
    const handle = Debug._handles[window];
    if (handle !== undefined && dbg_view_exists(handle))
      dbg_view_delete(handle);
    Debug._handles[window] = undefined;
  }

  // a method by house style — static getters are themselves safe on 0.20.
  static isOpen() {
    return Debug._open;
  }

  // Step_0: F3 toggle; while open, rebuild windows missing their dbg_view,
  // then run every section's update().
  static update() {
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
      if (section.update !== undefined) section.update();
    }
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
    // our views (the Perf section already shows fps).
    show_debug_overlay(Debug._open, true);
  }

  /**
   * one dbg_view hosting every section of `window`.
   * @param {string} window
   */
  static _build(window) {
    Debug._handles[window] = dbg_view(window, true);
    for (let i = 0; i < Debug.sections.length; i++) {
      const section = Debug.sections[i];
      if (Debug._windowOf(section) === window) {
        dbg_section(section.name, true);
        section.build();
      }
    }
  }
};
