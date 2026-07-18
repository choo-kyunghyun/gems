/**
 * DebugGeneral — the built-in "General"-window Debug panels (Time / Perf /
 * Log / Sim). Registered once from obj_game Create_0.
 */
globalThis.DebugGeneral = class DebugGeneral {
  // panels close over `game` (obj_game) so live bindings track the current
  // scene across swaps.
  static register(game) {
    Debug.add({
      name: "Time",
      data: { scale: 1, delta: 0, raw: 0 },
      _last: 1,
      build() {
        const d = this.data;
        d.scale = Time.scale;
        this._last = d.scale;
        dbg_slider(ref_create(d, "scale"), 0, 3, "Scale", 0.1);
        dbg_watch(ref_create(d, "delta"), "Delta");
        dbg_watch(ref_create(d, "raw"), "Raw");
      },
      update() {
        // Time.* are class statics — staged through data (contract: Debug)
        const d = this.data;
        if (d.scale !== this._last) Time.scale = d.scale;
        else d.scale = Time.scale;
        this._last = d.scale;
        d.delta = Time.delta;
        d.raw = Time.raw;
      },
    });
    Debug.add({
      name: "Perf",
      data: { fps: 0, scene: "", entities: 0 },
      _frames: 0,
      _t0: 0,
      build() {
        const d = this.data;
        this._frames = 0;
        this._t0 = current_time;
        dbg_watch(ref_create(d, "fps"), "FPS");
        dbg_watch(ref_create(d, "scene"), "Scene");
        dbg_watch(ref_create(d, "entities"), "Entities");
      },
      update() {
        const d = this.data;
        // fps/fps_real read 0 in JS (GMRT.md §2) — measure frames per
        // current_time second instead (runs while the overlay is open)
        this._frames++;
        const now = current_time;
        if (now - this._t0 >= 1000) {
          d.fps = round((this._frames * 1000) / (now - this._t0));
          this._frames = 0;
          this._t0 = now;
        }
        d.scene = game.scenes.label();
        const s = game.scenes.current;
        const w =
          s !== null && s !== undefined && s.world !== undefined
            ? s.world
            : null;
        d.entities = w !== null ? w.ids.next - w.ids.freeIndices.length : "-";
      },
    });
    Debug.add({
      name: "Log",
      data: { lines: 0 },
      build() {
        dbg_watch(ref_create(this.data, "lines"), "Lines");
        dbg_button("Clear", () => Log.clear());
      },
      update() {
        this.data.lines = Log._lines.length;
      },
    });
    // sim controls relocated from SystemMenu; Pause gates scene.step()
    Debug.add({
      name: "Sim",
      build() {
        // game.scenes is a plain object — the ref binds it live, two-way
        dbg_checkbox(ref_create(game.scenes, "paused"), "Pause");
        dbg_button("Step Frame", () => game.scenes.requestStep());
        dbg_button("Restart Scene", () => game.scenes.restart());
      },
    });
  }
};
