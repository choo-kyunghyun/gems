/**
 * NOT a base class to extend — GMRT subclassing is broken (#15067: subclass field inits never run,
 * `super` faults), so this class has exactly two jobs:
 *
 * 1. THE CONTRACT (duck-typed): the Game object drives any object shaped like this class —
 *      create(openScene) / update() / draw() / destroy()   required (called unconditionally)
 *      suspend() / resume()   optional — keep-switch freeze/thaw (a guest's host)
 *      result()               optional — a guest's return value, handed to back()'s onResult
 *      handleEscape()         optional — SystemMenu gives it first refusal on Esc/B
 *      label / gameplay       optional fields — display fallback / pause+nav opt-in
 *    `openScene(factory, opts)` is the ONLY handle a scene gets on the switch — a scene that opens
 *    a guest later (the RPG's arcade cabinet) stashes it in create(). There is no back-ref to the
 *    Game object.
 *    Genre screens (sceneRpg / scenePlatformer / sceneEditor / sceneUIKit) are STANDALONE classes
 *    satisfying it — composition, never `extends Scene`.
 *
 * 2. THE BLANK SCREEN: menus/one-shots instantiate it bare and assign what they need (the lobby:
 *    `Object.assign(new Scene(), { create, destroy })` — the no-op stubs below cover the rest). A
 *    screen COMPOSES its sub-modules, all optional:
 *      level (Level: grid + entities) · systems (Pipeline) · renderer · camera · ui
 *    A menu is just a screen with only `ui` set.
 */
globalThis.Scene = class Scene {
  label = "";

  /** `openScene` queues a navigation to another scene. */
  create(openScene) {}
  update() {}
  draw() {}
  destroy() {}

  // Freeze/thaw hooks: suspend when a guest keep-switches in front, resume when back() returns.
  // These defaults fit one UI root + one camera; a screen with extra state defines its own — the
  // RPG re-binds its keymap on resume, because the guest controller's destroy() unbound the
  // shared action names.
  suspend() {
    if (this.ui) UI.setEnabled(this.ui, false);
  }
  resume() {
    if (this.ui) UI.setEnabled(this.ui, true);
    if (this.camera) this.camera.assign(0);
  }
};
