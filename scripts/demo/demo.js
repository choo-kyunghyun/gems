// scene catalogue (SceneRegistry) + teardown helper.
// GemsUI factories split to separate files to avoid GMRT's large-file hoisting fault.
globalThis.teardownScene = function teardownScene(scene) {
  if (scene.camera) scene.camera.destroy();
  if (scene.renderer) scene.renderer.destroy();
  if (scene.world) scene.world.destroy();
  if (scene.ui) {
    UI.remove(scene.ui);
    scene.ui.destroy();
  }
};

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
