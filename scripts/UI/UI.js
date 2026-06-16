globalThis.UI = class UI {
  static roots = [];

  // The GUI layer's fixed design resolution. The GUI is sized to this (÷ uiScale) rather
  // than display_set_gui_maximise, so UI lays out identically on every monitor and scales
  // to the window — the SDF locale fonts keep text crisp at any GUI→window ratio.
  static designW = 1920;
  static designH = 1080;

  // Apply a UI scale: set the GUI layer to the design resolution divided by `scale` (a
  // larger scale → a smaller GUI canvas → bigger UI), then reflow every root to the new
  // size. Called once at boot and live from the Settings uiScale slider.
  static applyScale(scale) {
    display_set_gui_size(UI.designW / scale, UI.designH / scale);
    for (let i = 0; i < UI.roots.length; i++) UI.roots[i].markDirty();
  }

  static destroy() {
    UI.roots = [];
  }

  static insert(root, index = UI.roots.length, enabled = true) {
    root.enabled = enabled;
    UI.roots.splice(index, 0, root);
    return UI;
  }

  static remove(root) {
    const index = UI.roots.indexOf(root);
    if (index > -1) {
      UI.roots.splice(index, 1);
      return true;
    }
    return false;
  }

  static setEnabled(root, enabled) {
    const index = UI.roots.indexOf(root);
    if (index > -1) {
      UI.roots[index].enabled = enabled;
      return true;
    }
    return false;
  }

  static update() {
    let block = false;
    [...UI.roots].reverse().forEach((root) => {
      if (root.enabled) block = root.update(block) || block;
    });
  }

  static draw() {
    for (const root of UI.roots) {
      if (root.enabled) root.draw();
    }
  }
};
