/**
 * Debug — a registry of debug panels rendered by GameMaker's native ImGui
 * overlay (F3). The overlay renders OUTSIDE the game surface, so screen_save
 * misses it — human-only at draw time; an agent tunes from a harness by
 * writing the same live state a control binds (e.g. Time.scale,
 * game.scenes.requestStep()) or a panel's staged `data` field.
 *
 * A panel is a duck-typed object { name, window?, build(), update()?, data? }
 * and renders as ONE dbg_section; `window` names the dbg_view window hosting
 * it (default "General") — panels sharing a window stack as its sections in
 * registration order. The manager opens the section, then build() emits
 * dbg_* controls (it may open further sections — the Inspector's
 * per-component ones); update() runs each frame while the overlay is open.
 * Controls bind through ref_create — directly at a live plain object where
 * one exists (two-way, no sync code); a class STATIC or computed value can't
 * be ref'd, so it stages through the panel's plain `data` struct: update()
 * pulls reads (data.fps = fps) and, for editable fields,
 * change-detect-pushes so external writes (e.g. Time.scale = 0 on pause)
 * aren't clobbered by a stale control.
 *
 * Windows build LAZILY on first open (a bare dbg_view can raise the overlay,
 * and enabled = false must stay inert) and live until their panels are gone —
 * an F3 toggle hides, never rebuilds. No dbg_set_view on GMRT: dbg_section
 * lands in the most-recently-created dbg_view only, so any panel change
 * (add/re-add/remove) drops its WHOLE window for the lazy pass to rebuild —
 * a panel that churns (the Inspector re-registers per pick) takes a window
 * of its own so the stable ones keep their dragged positions.
 */
/**
 * @typedef {{name: string, build: function(): void} & Object<string, *>}
 *   DebugPanel
 * (the open record admits the optional members — window, update(), data —
 * and any per-panel staging state: `_last`, …)
 */
globalThis.Debug = class Debug {
  static enabled = true; // set false for a release build
  /** @type {DebugPanel[]} registration order = section order in a window */
  static panels = [];

  static _open = false;
  /** @type {Object<string, *>} window name -> its dbg_view handle */
  static _handles = {};

  /**
   * register (or replace by name) a panel; safe to re-call across scene
   * reloads — re-add()ing is also how a panel refreshes its own content.
   * @param {DebugPanel} panel
   */
  static add(panel) {
    Debug._invalidate(Debug._windowOf(panel));
    for (let i = 0; i < Debug.panels.length; i++) {
      if (Debug.panels[i].name === panel.name) {
        Debug._invalidate(Debug._windowOf(Debug.panels[i])); // old home, if it moved
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
        Debug._invalidate(Debug._windowOf(Debug.panels[i]));
        Debug.panels.splice(i, 1);
        return;
      }
    }
  }

  /** @param {DebugPanel} panel */
  static _windowOf(panel) {
    return panel.window !== undefined ? panel.window : "General";
  }

  /**
   * drop a window's dbg_view so the lazy pass rebuilds it (or lets it die
   * with its last panel).
   * @param {string} win
   */
  static _invalidate(win) {
    const h = Debug._handles[win];
    if (h !== undefined && dbg_view_exists(h)) dbg_view_delete(h);
    Debug._handles[win] = undefined;
  }

  // a method by house style — static getters are themselves safe on 0.20.
  static isOpen() {
    return Debug._open;
  }

  // Step_0: F3 toggle; while open, rebuild windows missing their dbg_view,
  // then run every panel's update().
  static update() {
    if (!Debug.enabled) return;
    if (keyboard_check_pressed(vk_f3)) Debug.toggle();
    if (!Debug._open) return;
    for (let i = 0; i < Debug.panels.length; i++) {
      const win = Debug._windowOf(Debug.panels[i]);
      const h = Debug._handles[win];
      if (h === undefined || !dbg_view_exists(h)) Debug._build(win);
    }
    for (let i = 0; i < Debug.panels.length; i++) {
      const p = Debug.panels[i];
      if (p.update !== undefined) p.update();
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
    // our views (the Perf panel already shows fps).
    show_debug_overlay(Debug._open, true);
  }

  /**
   * one dbg_view hosting every panel of `win`, each as its own section.
   * @param {string} win
   */
  static _build(win) {
    Debug._handles[win] = dbg_view(win, true);
    for (let i = 0; i < Debug.panels.length; i++) {
      const p = Debug.panels[i];
      if (Debug._windowOf(p) === win) {
        dbg_section(p.name, true);
        p.build();
      }
    }
  }
};
