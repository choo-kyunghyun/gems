// static root registry. update() reverse (later overlay blocks earlier); draw() forward.
globalThis.UI = class UI {
  /** @type {UIElement[]} */
  static roots = [];

  // fixed design resolution; GUI is sized to this ÷ uiScale so layout is monitor-independent.
  static designW = 1920;
  static designH = 1080;

  /** resize GUI layer to designRes/scale and reflow all roots. @param {number} scale */
  static applyScale(scale) {
    display_set_gui_size(UI.designW / scale, UI.designH / scale);
    for (let i = 0; i < UI.roots.length; i++) UI.roots[i].markDirty();
  }

  /** app teardown. */
  static destroy() {
    UI.roots = [];
  }

  /** @param {UIElement} root @param {number} [index] @param {boolean} [enabled] @returns {typeof UI} */
  static insert(root, index = UI.roots.length, enabled = true) {
    root.enabled = enabled;
    UI.roots.splice(index, 0, root);
    return UI;
  }

  /** @param {UIElement} root @returns {boolean} true if found and removed */
  static remove(root) {
    const index = UI.roots.indexOf(root);
    if (index > -1) {
      UI.roots.splice(index, 1);
      return true;
    }
    return false;
  }

  /** @param {UIElement} root @param {boolean} enabled @returns {boolean} true if found */
  static setEnabled(root, enabled) {
    const index = UI.roots.indexOf(root);
    if (index > -1) {
      UI.roots[index].enabled = enabled;
      return true;
    }
    return false;
  }

  /** later roots block earlier from the pointer. */
  static update() {
    let block = false;
    [...UI.roots].reverse().forEach((root) => {
      if (root.enabled) block = root.update(block) || block;
    });
  }

  static draw() {
    // GM doesn't clear the scissor between frames. After a resolution SHRINK the stale rect is bigger
    // than the new back buffer — a clip's gpu_get_scissor() reads it as a "nested" parent and replays
    // every frame → self-perpetuating "scissor not contained in render target" error. Re-anchor to the
    // live target each frame so nested-clip detection starts clean. Display.clipW/H is crash-safe
    // (not a lagged query); see UIElement._drawClipped.
    if (Display.renderW > 0) {
      gpu_set_scissor(0, 0, Display.clipW(), Display.clipH());
    }
    for (const root of UI.roots) {
      if (root.enabled) root.draw();
    }
    // advance so a GROW only clips next frame once the back buffer catches up; see Display.clipW.
    Display.advanceFrame();
  }
};
