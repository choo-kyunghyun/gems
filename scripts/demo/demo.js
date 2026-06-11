// ── Demo shell helpers ────────────────────────────────────────
// SceneRegistry (the lobby catalogue) + teardownScene (scene resource release).
// The GemsUI factory kit it used to also hold now lives in the Demo/GemsUI scripts
// (GemsTheme / GemsContainers / GemsWidgets / GemsControls) — split out so no single
// file grows large enough to trip GMRT 0.19's large-file handling.

// Releases the world / renderer / camera / UI a genre scene builds, in dependency
// order. Scenes hold these on `this`; call teardownScene(this) from destroy() after
// releasing any scene-specific resources (controllers, levels). Missing fields are
// skipped, so a partially-built scene still tears down safely.
globalThis.teardownScene = function teardownScene(scene) {
  if (scene.camera) scene.camera.destroy();
  if (scene.renderer) scene.renderer.destroy();
  if (scene.world) scene.world.destroy();
  if (scene.ui) {
    UI.remove(scene.ui);
    scene.ui.destroy();
  }
};

// ── SceneRegistry ────────────────────────────────────────────

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
