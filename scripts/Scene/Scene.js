/**
 * The catalogue of launchable scenes (the scene contract is `App`'s). A scene script registers its
 * factory from its top-level code, so the catalogue is complete by boot; it lives here because
 * top-level code runs in resource order (docs/GMRT.md) and `Scene` precedes every `scene*`
 * script. A consumer imposes its own category order.
 */
globalThis.Scene = {
  _entries: [],

  /** Catalogue a scene factory under a localized label and a `SCENE_CAT_*` category. */
  register(factory, opts) {
    Scene._entries.push({
      factory,
      label: opts.label,
      category: opts.category ?? "SCENE_CAT_MISC",
    });
  },

  /** The catalogue grouped by category, categories and entries both in registration order. */
  byCategory() {
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
  },
};
