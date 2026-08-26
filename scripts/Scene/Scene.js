/**
 * NOT a base class to extend — GMRT subclassing is broken (#15067: subclass field inits never run,
 * `super` faults), so this class has exactly two jobs:
 *
 * 1. THE CONTRACT (duck-typed): the Game object drives any object shaped like this class —
 *      create(openScene) / update() / draw() / destroy()   required (called unconditionally)
 *      handleEscape()         optional — GameOverlay gives it first refusal on Esc/B
 *      label / gameplay       optional fields — display fallback / pause+nav opt-in
 *    A scene is LIVE or GONE, never frozen: a switch destroys it, so it carries no state across
 *    one. `openScene(factory)` is the ONLY handle a scene gets on the switch — there is no
 *    back-ref to the Game object.
 *    Genre screens (sceneColony / sceneEditor / sceneUIKit) are STANDALONE classes
 *    satisfying it — composition, never `extends Scene`.
 *
 * 2. THE BLANK SCREEN: menus/one-shots instantiate it bare and assign what they need (the lobby:
 *    `Object.assign(new Scene(), { create, destroy })` — the no-op stubs below cover the rest). A
 *    screen COMPOSES its sub-modules, all optional:
 *      level (Level: grid + entities) · renderer · camera · ui
 *    A menu is just a screen with only `ui` set.
 */
globalThis.Scene = class Scene {
  label = "";

  /** `openScene` queues a navigation to another scene. */
  create(openScene) {}
  update() {}
  draw() {}
  destroy() {}
};
