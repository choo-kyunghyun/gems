globalThis.UI = class UI {
  static roots = [];

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
