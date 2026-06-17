// Static registry of root UIElements. update() traverses in reverse (highest index blocks
// lower, so a later-inserted overlay captures the pointer first); draw() traverses forward.
globalThis.UI = class UI {
  /** @type {UIElement[]} */
  static roots = [];

  // The GUI layer's fixed design resolution. The GUI is sized to this (÷ uiScale) rather
  // than display_set_gui_maximise, so UI lays out identically on every monitor and scales
  // to the window — the SDF locale fonts keep text crisp at any GUI→window ratio.
  static designW = 1920;
  static designH = 1080;

  /**
   * Set the GUI layer to the design resolution divided by `scale` (larger scale → smaller
   * canvas → bigger UI), then reflow every root. Called at boot and live from the uiScale slider.
   * @param {number} scale
   */
  static applyScale(scale) {
    display_set_gui_size(UI.designW / scale, UI.designH / scale);
    for (let i = 0; i < UI.roots.length; i++) UI.roots[i].markDirty();
  }

  /** Drop all roots (app teardown). */
  static destroy() {
    UI.roots = [];
  }

  /** Register a root at `index`. @param {UIElement} root @param {number} [index] @param {boolean} [enabled] @returns {typeof UI} */
  static insert(root, index = UI.roots.length, enabled = true) {
    root.enabled = enabled;
    UI.roots.splice(index, 0, root);
    return UI;
  }

  /** @param {UIElement} root @returns {boolean} whether the root was registered (and is now removed) */
  static remove(root) {
    const index = UI.roots.indexOf(root);
    if (index > -1) {
      UI.roots.splice(index, 1);
      return true;
    }
    return false;
  }

  /** Enable/disable a registered root. @param {UIElement} root @param {boolean} enabled @returns {boolean} whether the root was found */
  static setEnabled(root, enabled) {
    const index = UI.roots.indexOf(root);
    if (index > -1) {
      UI.roots[index].enabled = enabled;
      return true;
    }
    return false;
  }

  /** Update every enabled root, top-down (later roots block earlier ones from the pointer). */
  static update() {
    let block = false;
    [...UI.roots].reverse().forEach((root) => {
      if (root.enabled) block = root.update(block) || block;
    });
  }

  /** Draw every enabled root, bottom-up. */
  static draw() {
    // Reset the GPU scissor to the FULL current render target before drawing. GameMaker does not
    // clear the scissor between frames, so a clip from last frame leaves its rect set — and after a
    // resolution SHRINK that leftover is bigger than the new (smaller) back buffer, which a clip's
    // gpu_get_scissor() then reads as a "nested" parent and replays every frame → a self-perpetuating
    // "scissor not contained in the render target" validation error. Re-anchoring to the live target
    // (Display.clipW/H — crash-safe size, not a lagged query; see UIElement._drawClipped) each frame
    // clears the stale rect so nested-clip detection starts from the correct full target.
    if (Display.renderW > 0) {
      gpu_set_scissor(0, 0, Display.clipW(), Display.clipH());
    }
    for (const root of UI.roots) {
      if (root.enabled) root.draw();
    }
    // Age the render size by a frame so a resolution GROW only takes clip effect next frame, once the
    // back buffer has caught up (the back buffer lags a grow by a frame; see Display.clipW).
    Display.advanceFrame();
  }
};
