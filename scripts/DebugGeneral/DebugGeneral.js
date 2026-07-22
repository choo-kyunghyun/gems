/**
 * DebugGeneral — the built-in "General"-window Debug sections (Time / Perf /
 * Log / Sim). Registered once from obj_game Create_0.
 */
globalThis.DebugGeneral = {
  // sections read World.levels live, so bindings track the current level
  // across swaps.
  register() {
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
        // Time.* staged through data (contract: Debug)
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
      data: { fps: 0, level: "", entities: 0 },
      _frames: 0,
      _t0: 0,
      build() {
        const d = this.data;
        this._frames = 0;
        this._t0 = current_time;
        dbg_watch(ref_create(d, "fps"), "FPS");
        dbg_watch(ref_create(d, "level"), "Level");
        dbg_watch(ref_create(d, "entities"), "Entities");
      },
      update() {
        const d = this.data;
        // fps/fps_real read 0 in JS (GMRT.md → Runtime and Build Issues) — measure frames per
        // current_time second instead (runs while the overlay is open)
        this._frames++;
        const now = current_time;
        if (now - this._t0 >= 1000) {
          d.fps = round((this._frames * 1000) / (now - this._t0));
          this._frames = 0;
          this._t0 = now;
        }
        d.level = World.levels.label();
        const s = World.levels.current;
        const w =
          s !== null && s !== undefined && s.entities !== undefined
            ? s.entities
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
    // sim controls relocated from SystemMenu; Pause gates level.step()
    Debug.add({
      name: "Sim",
      build() {
        // World.levels is the one live manager — the ref binds `paused` two-way
        dbg_checkbox(ref_create(World.levels, "paused"), "Pause");
        dbg_button("Step Frame", () => World.levels.requestStep());
        dbg_button("Restart Level", () => World.levels.restart());
      },
    });
  },
};
