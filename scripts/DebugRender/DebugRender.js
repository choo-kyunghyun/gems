/**
 * DebugRender — registers a "Render" Debug panel of per-pass overlay toggles
 * (entity boxes / names / bbox outlines / tile overlay / grid / paths), the
 * feature that used to live in the SystemMenu Debug tab. Each toggle is a
 * get/set checkbox that finds the live scene's renderer pass of a given class by
 * `instanceof` (GMRT-safe on a flat class) and flips its `enabled` flag — so it
 * needs no per-scene re-registration: a scene without a given pass reads off and
 * no-ops on toggle. Both Debug front-ends render it (and `Debug.set("Render",
 * "Boxes", true)` lets an agent flip a pass, then screenshot the game surface).
 *
 * Registered once from obj_game Create_0 via DebugRender.register(game); the
 * controller is stable, so the getters read game.scenes.current live.
 */
globalThis.DebugRender = class DebugRender {
  static _game = null;

  static register(game) {
    DebugRender._game = game;
    // [pass class, label] — matches the old SystemMenu Debug-tab render toggles.
    const list = [
      [RenderDebugBox, "Boxes"],
      [RenderDebugName, "Names"],
      [RenderDebugEntity, "BBox"],
      [RenderDebugTileMap, "Tiles"],
      [RenderGrid, "Grid"],
      [RenderDebugPath, "Paths"],
      [RenderDebugRange, "Ranges"],
    ];
    Debug.panel("Render", (p) => {
      for (let i = 0; i < list.length; i++) {
        const cls = list[i][0];
        p.checkbox(
          list[i][1],
          () => {
            const pass = DebugRender._passOf(cls);
            return pass !== null && pass.enabled;
          },
          (v) => {
            const pass = DebugRender._passOf(cls);
            if (pass !== null) pass.enabled = v;
          },
        );
      }
    });
  }

  // The live scene's first renderer pass that is an instance of `cls`, or null.
  static _passOf(cls) {
    const g = DebugRender._game;
    const scene = g !== null ? g.scenes.current : null;
    if (scene === null || scene === undefined || scene.renderer == null)
      return null;
    const passes = scene.renderer.passes;
    for (let i = 0; i < passes.length; i++) {
      if (passes[i] instanceof cls) return passes[i];
    }
    return null;
  }
};
