/**
 * DebugRender — registers a "Render" Debug section of per-pass overlay
 * toggles. Core lists Core passes; a genre layer adds its own via
 * DebugRender.add(cls, label), so Core stays decoupled. Each toggle finds the
 * live scene's passes by instanceof (GMRT-safe on a flat class) and flips
 * `enabled` — no per-scene re-registration (a scene lacking the pass reads
 * off and no-ops). Registered once from Game Create_0.
 */
globalThis.DebugRender = {
  _game: null, // the Game object — the live scene pointer the toggles resolve passes through
  _extra: [], // [pass class, label] from a genre layer's add()

  /**
   * append a pass toggle (deduped by class) — the seam a genre layer uses
   * without Core referencing it. The class is loaded by the time the scene
   * calls this, so storing the ref here is load-order-safe; a call landing
   * before register() just refreshes nothing, and register() reads the list
   * fresh.
   */
  add(cls, label) {
    for (let i = 0; i < DebugRender._extra.length; i++) {
      if (DebugRender._extra[i][0] === cls) return; // already added
    }
    DebugRender._extra.push([cls, label]);
    Debug.refresh("Render");
  },

  register(game) {
    DebugRender._game = game;
    Debug.add(DebugRender._section);
  },

  // a pass toggle is a computed get/set over live pass instances — unref'able,
  // so it stages (contract: Debug)
  _section: {
    name: "Render",
    build() {
      // list built here (not a field initializer) so the class refs resolve at
      // call time — an initializer referencing a class that loads AFTER this
      // script faults at load (script load order).
      const list = [
        [RenderDebugEntity, "BBox"],
        [RenderDebugTileMap, "Tiles"],
        [RenderGrid, "Grid"],
        [RenderDebugPath, "Paths"],
        [RenderDebugRange, "Ranges"],
        [RenderEntityShadow, "Shadows"],
        [RenderWalls, "Walls"],
      ];
      for (let i = 0; i < DebugRender._extra.length; i++)
        list.push(DebugRender._extra[i]);
      for (let i = 0; i < list.length; i++) {
        const cls = list[i][0];
        Debug.checkbox(
          list[i][1],
          () => DebugRender._enabled(cls),
          (v) => DebugRender._apply(cls, v),
        );
      }
    },
  },

  _enabled(cls) {
    const passes = DebugRender._passesOf(cls);
    return passes.length > 0 ? passes[0].enabled : false;
  },

  /**
   * flip EVERY instance — a class can appear many times in one renderer (the colony's
   * stacked terrain RenderTileMaps), and toggling only the first would mislead
   */
  _apply(cls, v) {
    const passes = DebugRender._passesOf(cls);
    for (let i = 0; i < passes.length; i++) passes[i].enabled = v;
  },

  /**
   * The live scene's renderer passes that are instances of `cls` ([] when
   * none).
   */
  _passesOf(cls) {
    const out = [];
    const scene = DebugRender._game !== null ? DebugRender._game.scene : null;
    if (scene === null || scene === undefined || scene.renderer == null)
      return out;
    const passes = scene.renderer.passes;
    for (let i = 0; i < passes.length; i++) {
      if (passes[i] instanceof cls) out.push(passes[i]);
    }
    return out;
  },
};
