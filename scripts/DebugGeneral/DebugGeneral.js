/**
 * DebugGeneral — the built-in "General"-window Debug sections (Time / Perf /
 * Log / Sim). Registered once from Game Create_0.
 */
globalThis.DebugGeneral = {
  /**
   * `game` is the Game object — the getters read its live scene pointer, so
   * the bindings track the current scene across swaps.
   */
  register(game) {
    Debug.add({
      name: "Time",
      build() {
        // Time is a plain object — every field refs live, two-way
        dbg_slider(ref_create(Time, "scale"), 0, 3, "Scale", 0.1);
        dbg_watch(ref_create(Time, "delta"), "Delta");
        dbg_watch(ref_create(Time, "raw"), "Raw");
      },
    });
    Debug.add({
      name: "Perf",
      build() {
        Debug.watch("FPS", () => fps);
        Debug.watch("Scene", () => game.label());
        Debug.watch("Entities", () => {
          const scene = game.scene;
          const level =
            scene !== null && scene !== undefined ? scene.level : null;
          return level !== null && level !== undefined
            ? level.entities.count()
            : "-";
        });
      },
    });
    Debug.add({
      name: "Log",
      build() {
        Debug.watch("Lines", () => Log.count());
        dbg_button("Clear", () => Log.clear());
      },
    });
    // sim controls relocated from SystemMenu; Pause gates scene.update()
    Debug.add({
      name: "Sim",
      build() {
        // the ref binds the Game object's `paused` two-way
        dbg_checkbox(ref_create(game, "paused"), "Pause");
        dbg_button("Step Frame", () => game.requestStep());
        dbg_button("Restart Scene", () => game.restart());
      },
    });
  },
};
