/**
 * Not a base class to extend — BUG: subclassing is broken (docs/GMRT.md #15067) — so this class
 * has exactly three jobs:
 *
 * 1. The contract (duck-typed): the game drives any object shaped like this class —
 *      create(openScene) / update() / draw() / destroy()   required
 *      handleEscape()         optional — first refusal on an Esc/B the UI left
 *      retheme()              optional — rebuilds the scene's UI on a live theme swap
 *      label / gameplay       optional fields — display fallback / pause+nav opt-in
 *    A scene is live or gone, never frozen: a switch destroys it, so it carries no state across
 *    one. `openScene(factory)` is a scene's only handle on navigation; there is no back-ref to
 *    the game. A scene script exposes one global, a factory under the script's own name, and a
 *    scene is never reached through an alias. A genre screen is a standalone class satisfying the
 *    contract — composition, never `extends Scene`.
 *
 * 2. The blank screen: a menu or one-shot instantiates it bare and assigns what it needs; the
 *    no-op stubs below cover the rest. A screen composes its optional sub-modules:
 *      world · level · renderer · camera · ui
 *
 * 3. The catalogue (the statics): a scene script registers its factory from its top-level code,
 *    so the catalogue is complete by boot. It lives here because top-level code runs in resource
 *    order (docs/GMRT.md) and `Scene` precedes every `scene*` script. A consumer imposes its own
 *    category order.
 */
globalThis.Scene = class Scene {
  constructor() {
    this.label = ""; // in the constructor, never a class field (docs/GMRT.md)
  }

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
