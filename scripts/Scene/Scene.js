/**
 * NOT a base class to extend — GMRT subclassing is broken (#15067: subclass field inits never run,
 * `super` faults), so this class has exactly three jobs:
 *
 * 1. THE CONTRACT (duck-typed): the Game object drives any object shaped like this class —
 *      create(openScene) / update() / draw() / destroy()   required (called unconditionally)
 *      handleEscape()         optional — GameOverlay gives it first refusal on Esc/B
 *      retheme()              optional — the live theme swap rebuilds the scene's UI through it
 *      label / gameplay       optional fields — display fallback / pause+nav opt-in
 *    A scene is LIVE or GONE, never frozen: a switch destroys it, so it carries no state across
 *    one. Navigation is ONE transition (the Game object's `switchTo`, Create_0) behind two doors:
 *    a scene's is `openScene(factory)` — the only handle it gets on the switch, there is no
 *    back-ref to the Game object — while the GUI singletons the Game object hands itself to
 *    (`GameOverlay.update(game)`, `SaveGame.buildMenuTab(game)`) call `game.switchTo` and read
 *    `game.scene` directly, since they outlive every scene.
 *    A scene script exposes ONE global: a factory function under the script's own name
 *    (`sceneLobby`, `sceneColony`, `sceneFacet`). That one ref is what the Game object boots,
 *    the catalogue labels and `openScene` takes — a scene is never reached through an alias.
 *    Genre screens (sceneColony / sceneFacet) are STANDALONE classes
 *    satisfying it — composition, never `extends Scene`.
 *
 * 2. THE BLANK SCREEN: menus/one-shots instantiate it bare and assign what they need (the lobby:
 *    `Object.assign(new Scene(), { create, destroy })` — the no-op stubs below cover the rest). A
 *    screen COMPOSES its sub-modules, all optional:
 *      level (Level: grid + entities) · renderer · camera · ui
 *    A menu is just a screen with only `ui` set.
 *
 * 3. THE CATALOGUE (the statics): a scene script registers its factory from its top-level code —
 *    unlike the content registries, which register from `create()` — so the catalogue is complete
 *    by boot. It lives here and not in a script of its own because top-level code runs in
 *    resource order (docs/GMRT.md → script load order) and `Scene` is the one name that precedes
 *    every `scene*` script. `byCategory()` groups entries in registration order; a consumer
 *    imposes its own category order (the lobby's fixed display list). `labelOf` serves the Game
 *    object's display label, latched on every switch: the match is by factory ref.
 */
globalThis.Scene = class Scene {
  label = "";

  /** `openScene` queues a navigation to another scene. */
  create(openScene) {}
  update() {}
  draw() {}
  destroy() {}

  static _entries = [];

  /** Catalogue a scene factory under a localized label and a `SCENE_CAT_*` category. */
  static register(factory, opts) {
    Scene._entries.push({
      factory,
      label: opts.label,
      category: opts.category ?? "SCENE_CAT_MISC",
    });
  }

  /** Localized display label of a registered factory (matched by ref), or null. */
  static labelOf(factory) {
    const e = Scene._entries.find((x) => x.factory === factory);
    return e !== undefined ? e.label : null;
  }

  /** The catalogue grouped by category, categories and entries both in registration order. */
  static byCategory() {
    const result = [];
    const index = {};
    for (const e of Scene._entries) {
      if (!index[e.category]) {
        index[e.category] = [];
        result.push({ category: e.category, entries: index[e.category] });
      }
      index[e.category].push(e);
    }
    return result;
  }
};
