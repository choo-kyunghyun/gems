// Base class for demo scenes; SceneManager drives the lifecycle below.
// GMRT doesn't fire subclass field initializers, so a subclass's `label = "..."` never runs —
// the display name comes from the SceneRegistry entry, not the instance (see SceneManager.label()).
globalThis.Scene = class Scene {
  label = "";

  /** @param {(factory:Function) => void} openScene queue a navigation to another scene */
  create(openScene) {}
  /** Advance one frame. */
  step() {}
  /** Render the world view. */
  draw() {}
  /** Tear down UI roots + resources. */
  destroy() {}

  // Stack pause/resume hooks: suspend when a guest minigame is pushed in front, resume when it
  // pops. Defaults fit one UI root + one camera; a scene with extra state overrides them
  // (the RPG re-binds its keymap on resume).
  /** Hide this scene while a guest runs in front. */
  suspend() {
    if (this.ui) UI.setEnabled(this.ui, false);
  }
  /** Re-show + re-claim viewport 0 after a guest pops. */
  resume() {
    if (this.ui) UI.setEnabled(this.ui, true);
    if (this.camera) this.camera.assign(0);
  }
};
