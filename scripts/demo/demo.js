// scene catalogue (SceneRegistry) + teardown helper.
// Gems factories split to separate files to avoid GMRT's large-file hoisting fault.

/**
 * Release the `camera`/`renderer`/`entities`/`ui` a Scene holds on `this`, in dependency order
 * (missing fields skipped). Call it from `destroy()` AFTER releasing the scene's own
 * resources (controllers, guests) — those may still reference these.
 */
globalThis.teardownScene = function teardownScene(scene) {
  if (scene.camera) scene.camera.destroy();
  if (scene.renderer) scene.renderer.destroy();
  if (scene.entities) scene.entities.destroy();
  if (scene.ui) {
    UI.remove(scene.ui);
    scene.ui.destroy();
  }
};

/**
 * The lobby's scene catalogue. A scene registers from its script's top-level code — unlike the
 * content registries, which register from `create()` — so the catalogue is complete by boot.
 * `byCategory()` groups entries in registration order; a consumer imposes its own category
 * order (the lobby's fixed display list). `labelOf` serves the Game object's boot-wired
 * `resolveLabel` seam: the match is by factory ref, so a guest scene must be opened with the
 * factory it registered.
 */
globalThis.SceneRegistry = {
  _entries: [],
  add(factory, opts) {
    this._entries.push({
      factory,
      label: opts.label,
      category: opts.category ?? "SCENE_CAT_MISC",
    });
  },
  /**
   * Localized display label of a registered factory (matched by ref), or null.
   */
  labelOf(factory) {
    const e = this._entries.find((x) => x.factory === factory);
    return e !== undefined ? e.label : null;
  },
  byCategory() {
    const result = [];
    const index = {};
    for (const e of this._entries) {
      if (!index[e.category]) {
        index[e.category] = [];
        result.push({ category: e.category, entries: index[e.category] });
      }
      index[e.category].push(e);
    }
    return result;
  },
};
