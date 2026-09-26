// The root registry: update() runs topmost-first (a later root blocks earlier), draw() in order.
globalThis.UI = {
  roots: [],

  // the app's widget cues, injected; -1 stays silent
  sounds: {
    click: -1, // a press, pointer or nav
    tick: -1, // a nav focus step
  },

  // () => bool: the app's overlay driver, injected; true while its modal holds the GUI
  overlay: () => false,

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
    UI.roots.splice(index, 0, root);
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
   * The GUI's one input pass, in priority order: the tree, the drag it feeds, the overlay, whose
   * modal is then nav-reachable the same frame, the dialogue, which yields while that modal holds
   * the GUI, and last the nav, which acts only on what they left.
   */
  step() {
    UI.update();
    SlotDrag.update();
    if (!UI.overlay()) Dialogue.update();
    UINav.update();
  },

  /**
   * Later roots block earlier from the pointer; a tree that took it — a hovered or held widget,
   * an exclusive modal — then CLAIMS it, so no consumer after the UI sees the press.
   */
  update() {
    let block = false;
    [...UI.roots].reverse().forEach((root) => {
      if (root.enabled) block = root.update(block) || block;
    });
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
