global.UI = class UI {
  static roots = [];

  static destroy() {
    UI.roots = [];
  }

  static indexOf(root) {
    return UI.roots.indexOf(root);
  }

  static count() {
    return UI.roots.length;
  }

  static at(index) {
    return UI.roots[index];
  }

  static insert(root, index = UI.count(), enabled = true) {
    root.enabled = enabled;
    UI.roots.splice(index, 0, root);
    return UI;
  }

  static remove(root) {
    const index = UI.indexOf(root);
    if (index > -1) {
      UI.roots.splice(index, 1);
      return true;
    }
    return false;
  }

  static set_enabled(root, enabled) {
    const index = UI.indexOf(root);
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
