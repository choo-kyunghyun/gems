/**
 * DebugRender — registers a "Render" Debug panel of per-pass overlay toggles. Core lists
 * Core passes; a genre layer adds its own via DebugRender.add(cls, label), so Core stays decoupled.
 * Each toggle finds the live scene's pass by instanceof (GMRT-safe on a flat class) and flips
 * `enabled` — no per-scene re-registration (a scene lacking the pass reads off and no-ops).
 * Registered once from obj_game Create_0; getters read game.scenes.current live.
 */
globalThis.DebugRender = class DebugRender {
  static _game = null;
  static _extra = []; // [pass class, label] contributed by a genre layer via add()

  // append a pass toggle (deduped by class) — the seam a genre layer uses without Core
  // referencing it. Rebuilds if register() ran; else register() (Create_0) picks it up.
  // The class is loaded by the time the scene calls this, so storing the ref here is load-order-safe.
  static add(cls, label) {
    for (let i = 0; i < DebugRender._extra.length; i++) {
      if (DebugRender._extra[i][0] === cls) return; // already added
    }
    DebugRender._extra.push([cls, label]);
    if (DebugRender._game !== null) DebugRender._build();
  }

  static register(game) {
    DebugRender._game = game;
    DebugRender._build();
  }

  static _build() {
    // built inside the method (not a static field) so the class refs resolve at call time —
    // a static field referencing a class that loads AFTER this script faults at load (see CLAUDE.md).
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
    Debug.panel("Render", (p) => {
      for (let i = 0; i < list.length; i++) {
        const cls = list[i][0];
        p.checkbox(
          list[i][1],
          () => {
            const passes = DebugRender._passesOf(cls);
            return passes.length > 0 && passes[0].enabled;
          },
          (v) => {
            // flip EVERY instance — a class can appear twice in one renderer (the RPG's
            // resident + chunk RenderWalls), and toggling only the first would mislead
            const passes = DebugRender._passesOf(cls);
            for (let j = 0; j < passes.length; j++) passes[j].enabled = v;
          },
        );
      }
    });
  }

  // The live scene's renderer passes that are instances of `cls` ([] when none).
  static _passesOf(cls) {
    const out = [];
    const g = DebugRender._game;
    const scene = g !== null ? g.scenes.current : null;
    if (scene === null || scene === undefined || scene.renderer == null)
      return out;
    const passes = scene.renderer.passes;
    for (let i = 0; i < passes.length; i++) {
      if (passes[i] instanceof cls) out.push(passes[i]);
    }
    return out;
  }
};
