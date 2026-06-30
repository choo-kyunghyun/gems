/**
 * DebugInspector — ECS entity inspector over the Debug system. While the overlay is open,
 * left-click a world entity to select it: registers a live-bound "Entity" panel of each
 * component's scalar fields (editing mutates the real entity). Selection highlighted on the GUI layer.
 * Wired: update(game) in Step_0 (after DebugImGui), draw(game) in Draw_75.
 * Picking uses the latched LMB edge (mouse edges are realtime-sampled — see CLAUDE.md).
 */
globalThis.DebugInspector = class DebugInspector {
  static _world = null;
  static _id = -1;
  static _registered = false; // Entity panel registered at least once
  static pickRadius = 64; // max world px from cursor to accept a pick
  static markerR = 18; // highlight half-size (GUI px)
  static highlightColor = Color.parse("#ffd34d");

  // select an entity, or (null, -1) to deselect. Deselect empties the panel to a
  // placeholder rather than removing it, so its Inspector window persists.
  static select(world, id) {
    const valid =
      world !== null &&
      world !== undefined &&
      id !== undefined &&
      id !== -1 &&
      world.isValid(id);
    const nextWorld = valid ? world : null;
    const nextId = valid ? id : -1;
    // no change and already registered → skip the rebuild.
    if (
      nextWorld === DebugInspector._world &&
      nextId === DebugInspector._id &&
      DebugInspector._registered
    )
      return;
    DebugInspector._world = nextWorld;
    DebugInspector._id = nextId;
    DebugInspector._register();
  }

  // (re)register the Entity panel: a placeholder when nothing is selected, else the
  // picked entity's live-bound scalar fields.
  static _register() {
    DebugInspector._registered = true;
    const world = DebugInspector._world;
    const id = DebugInspector._id;
    Debug.panel("Entity", (p) => {
      if (world === null || id === -1) {
        p.text("No entity selected — click one in the world.");
        return;
      }
      p.watch("id", () => id);
      p.button("Deselect", () => DebugInspector.select(null, -1));
      // for...in over a plain object is GMRT-safe (componentsOf + data are plain).
      const comps = world.componentsOf(id);
      for (const token in comps) {
        const data = comps[token];
        p.text("— " + token + " —");
        for (const key in data) {
          const v = data[key];
          const t = typeof v;
          const label = token + "." + key;
          if (t === "number") p.input(label, data, key, "f");
          else if (t === "boolean") p.checkbox(label, data, key);
          else if (t === "string") p.input(label, data, key, "s");
          // objects / arrays / Sets have no scalar editor — skipped.
        }
      }
    });
  }

  static clear() {
    DebugInspector.select(null, -1);
  }

  static update(game) {
    if (!Debug.enabled) return;
    // register the Entity panel up front so its window exists before the first pick.
    if (!DebugInspector._registered) DebugInspector.select(null, -1);
    const scene = game.scenes.current;
    const world =
      scene !== null && scene !== undefined && scene.world !== undefined
        ? scene.world
        : null;

    // drop a stale selection (entity removed, or scene/world swapped).
    if (DebugInspector._id !== -1) {
      if (
        world !== DebugInspector._world ||
        world === null ||
        !world.isValid(DebugInspector._id)
      ) {
        DebugInspector.select(null, -1);
      }
    }

    // pick only while the overlay is open, cursor isn't over it, scene has world + camera.
    if (!DebugImGui._open || world === null) return;
    if (scene.camera === undefined) return;
    if (is_mouse_over_debug_overlay()) return;
    if (!UIPointer.pressed) return;

    const cam = scene.camera;
    const wx = DebugInspector._toWorldX(cam);
    const wy = DebugInspector._toWorldY(cam);
    const id = Query.nearest(world, wx, wy, {
      maxDist: DebugInspector.pickRadius,
    });
    if (id !== -1) DebugInspector.select(world, id);
  }

  static draw(game) {
    if (!Debug.enabled || !DebugImGui._open || DebugInspector._id === -1)
      return;
    const world = DebugInspector._world;
    if (world === null || !world.isValid(DebugInspector._id)) return;
    const scene = game.scenes.current;
    if (scene === null || scene === undefined || scene.camera === undefined)
      return;
    const pos = world.get(Position, DebugInspector._id);
    if (pos === undefined) return;

    const cam = scene.camera;
    const gw = display_get_gui_width();
    const gh = display_get_gui_height();
    const sx = ((pos.x - (cam.toX - cam.width / 2)) / cam.width) * gw;
    const sy = ((pos.y - (cam.toY - cam.height / 2)) / cam.height) * gh;
    const r = DebugInspector.markerR;
    const c = DebugInspector.highlightColor;

    const a0 = draw_get_alpha();
    draw_set_alpha(1);
    draw_rectangle_color(sx - r, sy - r, sx + r, sy + r, c, c, c, c, true);
    draw_line_color(sx - r, sy, sx + r, sy, c, c);
    draw_line_color(sx, sy - r, sx, sy + r, c, c);
    draw_set_alpha(a0);
  }

  // cursor (GUI px) -> world px via the camera's own view rect — camera_get_view_*
  // returns 0 for the matrix-driven Camera (see CLAUDE.md). Assumes world view fills the GUI.
  static _toWorldX(cam) {
    const mx = device_mouse_x_to_gui(0);
    return cam.toX - cam.width / 2 + (mx / display_get_gui_width()) * cam.width;
  }

  static _toWorldY(cam) {
    const my = device_mouse_y_to_gui(0);
    return (
      cam.toY - cam.height / 2 + (my / display_get_gui_height()) * cam.height
    );
  }
};
