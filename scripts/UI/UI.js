// The root registry: update() runs topmost-first (a later root blocks earlier), draw() in order.
globalThis.UI = {
  roots: [], // replaced on every insert/remove, never mutated, as a walk reads the one it began with

  // the app's widget cues, injected; -1 stays silent
  sounds: {
    click: -1, // a press, pointer or nav
    tick: -1, // a nav focus step
  },

  // the app's menu driver, injected
  menu: () => {},

  // GUI is sized to this ÷ uiScale, so layout is monitor-independent
  designW: 1920,
  designH: 1080,

  /**
   * Applies live while the scale is dragged, so full-screen chrome must fill the space with flex
   * (`grow: true`), never a GUI size snapshotted at build time.
   */
  applyScale(scale) {
    display_set_gui_size(UI.designW / scale, UI.designH / scale);
    for (let i = 0; i < UI.roots.length; i++) UI.roots[i].markDirty();
  },

  destroy() {
    UI.roots = [];
  },

  insert(root, index = UI.roots.length, enabled = true) {
    root.enabled = enabled;
    const roots = UI.roots.slice();
    roots.splice(index, 0, root);
    UI.roots = roots;
    // THE LAYOUT GUARANTEE: layout reads are NaN until the first layout pass, so a root is laid
    // out at registration, at the end of update and before draw — components carry NO per-widget
    // NaN guards. The one residual path, a subtree inserted mid-update into a not-yet-traversed
    // branch, is contained: hit-tests are NaN-safe and persistent scalars clamp with positive
    // tests, so NaN can't stick.
    root.refresh();
    return UI;
  },

  remove(root) {
    const index = UI.roots.indexOf(root);
    if (index > -1) {
      const roots = UI.roots.slice();
      roots.splice(index, 1);
      UI.roots = roots;
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
   * The GUI's one input pass, in priority order: the tree, the drag it feeds, the menu driver,
   * whose page is then nav-reachable the same frame, and last the nav, which acts only on what
   * they left.
   */
  step() {
    UI.update();
    SlotDrag.update();
    UI.menu();
    UINav.update();
  },

  /**
   * Later roots block earlier from the pointer; a tree that took it — a hovered or held widget —
   * then CLAIMS it, so no consumer after the UI sees the press.
   */
  update() {
    let block = false;
    const roots = UI.roots;
    for (let i = roots.length - 1; i >= 0; i--) {
      const root = roots[i];
      if (root.enabled) block = root.update(block) || block;
    }
    if (block) Input.claimPointer();
  },

  draw() {
    // BUG: the scissor persists across frames; after a resolution shrink the stale rect exceeds
    // the back buffer and a nested clip replays it every frame. Re-anchor to the live target.
    if (Display.renderW > 0) {
      gpu_set_scissor(0, 0, Display.clipW(), Display.clipH());
    }
    for (const root of UI.roots) {
      if (root.enabled) {
        // a root can still be dirty here: children built after insert, or mutations after the
        // end-of-update refresh
        if (root.dirty) root.refresh();
        root.draw();
      }
    }
    // a grow only clips from next frame, once the back buffer catches up
    Display.advanceFrame();
  },
};
