// root registry. update() reverse (later overlay blocks earlier); draw() forward.
globalThis.UI = {
  roots: [],

  // fixed design resolution; GUI is sized to this ÷ uiScale so layout is monitor-independent.
  designW: 1920,
  designH: 1080,

  /**
   * Resize the GUI layer to designRes/scale and reflow all roots. Applies LIVE (the uiScale
   * slider drags through it), which constrains how full-screen chrome is built: fill the space
   * with flex (`grow: true`), never by snapshotting `display_get_gui_height()` at build time —
   * a snapshot is stale the moment the scale moves. Fixed-size windows may size themselves.
   */
  applyScale(scale) {
    display_set_gui_size(UI.designW / scale, UI.designH / scale);
    for (let i = 0; i < UI.roots.length; i++) UI.roots[i].markDirty();
  },

  /** app teardown. */
  destroy() {
    UI.roots = [];
  },

  insert(root, index = UI.roots.length, enabled = true) {
    root.enabled = enabled;
    UI.roots.splice(index, 0, root);
    // THE LAYOUT GUARANTEE: flexpanel layout reads are NaN until the first
    // flexpanel_calculate_layout, so three refreshes close every path — this one at
    // registration (a root inserted mid-frame from an onClick, e.g. a modal/dropdown, never
    // reaches UI.draw un-laid-out), the end-of-update refresh (UIElement.update), and the
    // pre-draw dirty refresh (UI.draw). Components therefore never observe NaN layout and
    // carry NO per-widget NaN guards — do not add them back.
    // One residual path: a subtree inserted mid-update-pass into a not-yet-traversed sibling
    // branch can still see NaN in that frame's onUpdate. It is contained, not guarded —
    // hit-tests are NaN-safe (point_in_rectangle with NaN is false) and the persistent-scalar
    // sinks (UITable._top, UIScroll.scroll/_track) clamp with positive tests, so NaN can't
    // stick. UIElement._drawClipped keeps its own zero-size check (it guards gpu_set_scissor).
    root.refresh();
    return UI;
  },

  remove(root) {
    const index = UI.roots.indexOf(root);
    if (index > -1) {
      UI.roots.splice(index, 1);
      return true;
    }
    return false;
  },

  setEnabled(root, enabled) {
    const index = UI.roots.indexOf(root);
    if (index > -1) {
      UI.roots[index].enabled = enabled;
      return true;
    }
    return false;
  },

  /**
   * True while a widget under the cursor captures the pointer, latched by update() each frame.
   * The gate for world input that must yield to the UI (CameraFollow's wheel zoom); world
   * consumers run after UI.update in Game Step_0, so the read is same-frame fresh.
   */
  captured: false,

  /** later roots block earlier from the pointer. */
  update() {
    let block = false;
    [...UI.roots].reverse().forEach((root) => {
      if (root.enabled) block = root.update(block) || block;
    });
    UI.captured = block;
  },

  draw() {
    // GM doesn't clear the scissor between frames. After a resolution SHRINK the stale rect is bigger
    // than the new back buffer — a clip's gpu_get_scissor() reads it as a "nested" parent and replays
    // every frame → self-perpetuating "scissor not contained in render target" error. Re-anchor to the
    // live target each frame so nested-clip detection starts clean. Display.clipW/H is crash-safe
    // (not a lagged query); see UIElement._drawClipped.
    if (Display.renderW > 0) {
      gpu_set_scissor(0, 0, Display.clipW(), Display.clipH());
    }
    for (const root of UI.roots) {
      if (root.enabled) {
        // a root can still be dirty here: scenes insert-then-build (children added after
        // UI.insert's refresh), and UINav-driven mutations (accordion expand) land after
        // UI.update's end-of-update refresh. Recompute before drawing so no subtree draws
        // with NaN layout.
        if (root.dirty) root.refresh();
        root.draw();
      }
    }
    // advance so a GROW only clips next frame once the back buffer catches up; see Display.clipW.
    Display.advanceFrame();
  },
};
