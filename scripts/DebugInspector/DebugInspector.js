/**
 * DebugInspector — the ECS entity inspector, a feature layered on the Debug
 * system (it registers a Debug panel; both front-ends render it for free). While
 * the DebugImGui overlay is open, left-click an entity in the world to select it:
 * the inspector reads world.componentsOf(id) and (re)registers an "Entity" panel
 * exposing each component's scalar fields — numbers as editable inputs, booleans
 * as checkboxes, strings as inputs — bound LIVE to the component data objects, so
 * editing a field (in the overlay, or via Debug.set("Entity", "Health.hp", …))
 * mutates the real entity. The selection is highlighted on the GUI layer.
 *
 * Wiring: DebugInspector.update(game) in obj_game Step_0 (after DebugImGui),
 * DebugInspector.draw(game) in Draw_75. The agent verifies via debug.txt (the
 * text port serialises the same Entity panel) + a screen_save of the highlight.
 *
 * Picking uses SlotDrag's latched LMB edge (mouse edges are realtime-sampled —
 * see CLAUDE.md), and only fires when the cursor is NOT over the overlay. A pick
 * click may also reach the scene (e.g. fire a weapon) — acceptable for a dev tool.
 */
globalThis.DebugInspector = class DebugInspector {
  static _world = null;
  static _id = -1;
  static pickRadius = 64; // max world px from the cursor to accept a pick
  static markerR = 18; // highlight half-size (GUI px)
  static highlightColor = Color.parse("#ffd34d");

  // Select an entity and (re)register the Entity panel from its components. Pass
  // (null, -1) — or an invalid id — to deselect and remove the panel.
  static select(world, id) {
    const valid =
      world !== null &&
      world !== undefined &&
      id !== undefined &&
      id !== -1 &&
      world.isValid(id);
    if (!valid) {
      if (DebugInspector._id !== -1) Debug.remove("Entity");
      DebugInspector._world = null;
      DebugInspector._id = -1;
      return;
    }
    // Re-selecting the same entity is a no-op (avoids a needless overlay rebuild).
    if (DebugInspector._world === world && DebugInspector._id === id) return;

    DebugInspector._world = world;
    DebugInspector._id = id;
    const comps = world.componentsOf(id);
    Debug.panel("Entity", (p) => {
      p.watch("id", () => id);
      p.button("Deselect", () => DebugInspector.select(null, -1));
      // for...in over a plain object is GMRT-safe (componentsOf + data are plain).
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
    const scene = game.scenes.current;
    const world =
      scene !== null && scene !== undefined && scene.world !== undefined
        ? scene.world
        : null;

    // Drop a stale selection (entity removed, or the scene/world swapped out).
    if (DebugInspector._id !== -1) {
      if (
        world !== DebugInspector._world ||
        world === null ||
        !world.isValid(DebugInspector._id)
      ) {
        DebugInspector.select(null, -1);
      }
    }

    // Pick only while the overlay is open, the cursor isn't over it, and the
    // scene has a world + camera.
    if (!DebugImGui._open || world === null) return;
    if (scene.camera === undefined) return;
    if (is_mouse_over_debug_overlay()) return;
    if (!SlotDrag.pressed) return;

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

  // Cursor (GUI px) -> world px, via the ortho camera's own view rect (toX/toY/
  // width/height — camera_get_view_* returns 0 for the matrix-driven Camera; see
  // CLAUDE.md). Assumes the world view fills the GUI.
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
