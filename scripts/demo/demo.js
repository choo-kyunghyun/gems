// level catalogue (LevelRegistry) + teardown helper.
// GemsUI factories split to separate files to avoid GMRT's large-file hoisting fault.

/**
 * Release the `camera`/`renderer`/`entities`/`ui` a Level holds on `this`, in dependency order
 * (missing fields skipped). Call it from `destroy()` AFTER releasing the level's own
 * resources (controllers, sub-levels) — those may still reference these.
 * @param {Level} level
 */
globalThis.teardownLevel = function teardownLevel(level) {
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
 * order (the lobby's fixed display list). `labelOf` serves LevelManager's boot-wired
 * `resolveLabel` seam (obj_game wires it): the match is by factory ref, so a guest level must
 * be opened with the factory it registered.
 */
globalThis.LevelRegistry = {
  _entries: [],
  add(factory, opts) {
    this._entries.push({
      factory,
      label: opts.label,
      category: opts.category ?? "SCENE_CAT_MISC",
    });
  },
  /** Localized display label of a registered factory (matched by ref), or null. @param {() => Level} factory */
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
