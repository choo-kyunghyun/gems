/**
 * DebugRender — registers a "Render" Debug section of per-pass overlay
 * toggles. Core lists Core passes; a genre layer adds its own via
 * DebugRender.add(cls, label), so Core stays decoupled. Each toggle finds the
 * live scene's passes by instanceof (GMRT-safe on a flat class) and flips
 * `enabled` — no per-scene re-registration (a scene lacking the pass reads
 * off and no-ops). Registered once from obj_game Create_0.
 */
globalThis.DebugRender = class DebugRender {
  static _game = null;
  static _extra = []; // [pass class, label] from a genre layer's add()

  // append a pass toggle (deduped by class) — the seam a genre layer uses
  // without Core referencing it. Re-adds the section if register() ran
  // (build() resolves the list fresh); else register() (Create_0) picks it
  // up. The class is loaded by the time the scene calls this, so storing the
  // ref here is load-order-safe.
  static add(cls, label) {
    for (let i = 0; i < DebugRender._extra.length; i++) {
      if (DebugRender._extra[i][0] === cls) return; // already added
    }
    DebugRender._extra.push([cls, label]);
    if (DebugRender._game !== null) Debug.add(DebugRender._section);
  }

  static register(game) {
    DebugRender._game = game;
    Debug.add(DebugRender._section);
  }

  // the "Render" section: pass toggles are computed get/set over live pass
  // instances — unref'able, staged through data (contract: Debug)
  static _section = {
    name: "Render",
    data: {},
    _last: {},
    _list: [],
    build() {
      // list built here (not a static field) so the class refs resolve at
      // call time — a static field referencing a class that loads AFTER this
      // script faults at load (GMRT.md → Quirks: static-field init).
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
      this._list = list;
      for (let i = 0; i < list.length; i++) {
        const label = list[i][1];
        this.data[label] = DebugRender._enabled(list[i][0]);
        this._last[label] = this.data[label];
        dbg_checkbox(ref_create(this.data, label), label);
      }
    },
    update() {
      const list = this._list;
      for (let i = 0; i < list.length; i++) {
        const cls = list[i][0];
        const label = list[i][1];
        if (this.data[label] !== this._last[label])
          DebugRender._apply(cls, this.data[label]);
        else this.data[label] = DebugRender._enabled(cls);
        this._last[label] = this.data[label];
      }
    },
  };

  static _enabled(cls) {
    const passes = DebugRender._passesOf(cls);
    return passes.length > 0 && passes[0].enabled;
  }

  // flip EVERY instance — a class can appear twice in one renderer (the RPG's
  // resident + chunk RenderWalls), and toggling only the first would mislead
  static _apply(cls, v) {
    const passes = DebugRender._passesOf(cls);
    for (let i = 0; i < passes.length; i++) passes[i].enabled = v;
  }

  // The live scene's renderer passes that are instances of `cls` ([] when
  // none).
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
