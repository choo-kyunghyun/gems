// Base class for every demo scene. Scenes are factory functions returning a fresh instance;
// SceneManager drives the lifecycle below. NOTE: a subclass's `label = "..."` field never runs
// (GMRT doesn't fire subclass field initializers), so the display name comes from the
// SceneRegistry entry, not the instance — see SceneManager.label().
globalThis.Scene = class Scene {
  label = "";

  /** Build the scene. @param {(factory:Function) => void} openScene queue a navigation to another scene */
  create(openScene) {}
  /** Advance the scene one frame (per-frame update tick). */
  step() {}
  /** Render the scene's world view. */
  draw() {}
  /** Tear down UI roots + resources. */
  destroy() {}

  // Pause/resume hooks for the SceneManager stack: a scene is suspended when a guest minigame is
  // pushed in front of it, resumed when that guest pops. The defaults fit a scene with one UI root
  // + one camera (RPG, platformer): hide the UI and re-claim the viewport. A scene with extra
  // roots or managers overrides resume()/suspend() (the RPG re-binds its keymap on resume).
  /** Suspend: hide this scene while a guest runs in front of it. */
  suspend() {
    if (this.ui) UI.setEnabled(this.ui, false);
  }
  /** Resume: re-show this scene and re-claim viewport 0 after a guest pops. */
  resume() {
    if (this.ui) UI.setEnabled(this.ui, true);
    if (this.camera) this.camera.assign(0);
  }
};
