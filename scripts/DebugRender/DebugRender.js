/**
 * DebugRender — registers a "Render" Debug panel of per-pass overlay toggles
 * (entity boxes / names / bbox outlines / tile overlay / grid / paths), the
 * feature that used to live in the SystemMenu Debug tab. Core lists only Core passes;
 * a genre layer contributes its own via `DebugRender.add(cls, label)` (e.g. the RPG's
 * `RenderDebugAnimator`, which reads the Demo-layer `Animator`), so Core stays decoupled.
 * Each toggle is a
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
  static _extra = []; // [pass class, label] contributed by a genre layer via add()

  // Append a render-pass toggle to the "Render" panel (deduped by class) — the seam a genre
  // layer uses to contribute its own pass without Core referencing it (e.g. the RPG registers
  // RenderDebugAnimator from RpgMap.build, since that pass reads the Demo-layer Animator).
  // Rebuilds the panel if register() already ran; otherwise register() (obj_game Create_0,
  // after the boot scene's create) picks it up. RenderDebugAnimator is loaded by the time the
  // scene calls this, so storing the class ref here is load-order-safe.
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
    // Core debug passes. Kept inside the method (not a static field initializer) so the pass
    // class refs resolve at call time — a static field referencing a class that loads AFTER
    // this script would fault at load (see CLAUDE.md). Genre passes append via _extra.
    const list = [
      [RenderDebugBox, "Boxes"],
      [RenderDebugName, "Names"],
      [RenderDebugDirection, "Facing"],
      [RenderDebugEntity, "BBox"],
      [RenderDebugTileMap, "Tiles"],
      [RenderGrid, "Grid"],
      [RenderDebugPath, "Paths"],
      [RenderDebugRange, "Ranges"],
      [RenderEntityShadow, "Shadows"],
    ];
    for (let i = 0; i < DebugRender._extra.length; i++)
      list.push(DebugRender._extra[i]);
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
