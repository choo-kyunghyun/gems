// level catalogue (SceneRegistry) + teardown helper.
// GemsUI factories split to separate files to avoid GMRT's large-file hoisting fault.

/**
 * Release the `camera`/`renderer`/`entities`/`ui` a Level holds on `this`, in dependency order
 * (missing fields skipped). Call it from `destroy()` AFTER releasing the level's own
 * resources (controllers, sub-levels) — those may still reference these.
 * @param {Level} level
 */
globalThis.teardownScene = function teardownScene(level) {
  if (level.camera) level.camera.destroy();
  if (level.renderer) level.renderer.destroy();
  if (level.entities) level.entities.destroy();
  if (level.ui) {
    UI.remove(level.ui);
    level.ui.destroy();
  }
};

/**
 * The lobby's level catalogue. A level registers from its script's top-level code — unlike the
 * content registries, which register from `create()` — so the catalogue is complete by boot.
 * `byCategory()` groups entries in registration order; a consumer imposes its own category
 * order (the lobby's fixed display list). `LevelManager._make` also reads `_entries` to
 * resolve a level's localized display label by factory ref.
 */
globalThis.SceneRegistry = {
  _entries: [],
  add(factory, opts) {
    this._entries.push({
      factory,
      label: opts.label,
      category: opts.category ?? "기타",
    });
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
