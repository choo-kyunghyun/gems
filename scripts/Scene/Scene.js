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
};
