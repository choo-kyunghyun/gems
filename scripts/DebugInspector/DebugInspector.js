/**
 * DebugInspector — ECS entity inspector over the Debug system. While the
 * overlay is open, left-click a world entity to select it: registers an
 * "Entity" Debug section whose refs bind the picked entity's component
 * structs
 * directly (editing mutates the real entity). Selection highlighted on the
 * GUI layer.
 * Wired: update() in Step_0 (after Debug.update), draw() in Draw_75.
 * Picking uses the latched LMB edge (the UIPointer poll-once rule).
 */
globalThis.DebugInspector = {
  _entities: null,
  _id: -1,
  _registered: false, // Entity section registered at least once
  pickRadius: 128, // max world px from cursor to accept a pick
  markerR: 18, // highlight half-size (GUI px)
  highlightColor: Color.parse("#ffd34d"),

  /**
   * select an entity, or (null, -1) to deselect. Deselect swaps the section
   * to a placeholder rather than removing it, so its window stays available.
   */
  select(entities, id) {
    const valid =
      entities !== null &&
      entities !== undefined &&
      id !== undefined &&
      id !== -1 &&
      entities.isValid(id);
    const nextEntities = valid ? entities : null;
    const nextId = valid ? id : -1;
    // no change and already registered → skip the rebuild.
    if (
      nextEntities === DebugInspector._entities &&
      nextId === DebugInspector._id &&
      DebugInspector._registered
    )
      return;
    DebugInspector._entities = nextEntities;
    DebugInspector._id = nextId;
    DebugInspector._register();
  },

  /**
   * (re)register the "Entity" section: a placeholder when nothing is
   * selected, else the picked entity's scalar fields — refs bind the REAL
   * component structs, so edits mutate the entity live with no staging.
   * Re-add()ing rebuilds the section's window — its OWN ("Inspector"), so
   * per-pick churn never moves the stable "General" window.
   */
  _register() {
    DebugInspector._registered = true;
    const entities = DebugInspector._entities;
    const id = DebugInspector._id;
    Debug.add({
      name: "Entity",
      window: "Inspector",
      build() {
        if (entities === null || id === -1) {
          dbg_text("No entity selected — click one in the world.");
          return;
        }
        dbg_text("id " + id);
        dbg_button("Deselect", () => DebugInspector.select(null, -1));
        // for...in over a plain object is GMRT-safe (componentsOf + data are
        // plain). Labels stay token-prefixed: components share field names
        // (Position.x / Velocity.x), and a duplicate label is one control to
        // ImGui.
        const comps = entities.componentsOf(id);
        for (const token in comps) {
          const data = comps[token];
          dbg_section(token, true);
          for (const key in data) {
            const v = data[key];
            const t = typeof v;
            const label = token + "." + key;
            if (t === "number")
              dbg_text_input(ref_create(data, key), label, "f");
            else if (t === "boolean")
              dbg_checkbox(ref_create(data, key), label);
            else if (t === "string")
              dbg_text_input(ref_create(data, key), label, "s");
            // objects / arrays / Sets have no scalar editor — skipped.
          }
        }
      },
    });
  },

  clear() {
    DebugInspector.select(null, -1);
  },

  update() {
    if (!Debug.enabled) return;
    // register the Entity section up front so its window exists before the
    // first pick.
    if (!DebugInspector._registered) DebugInspector.select(null, -1);
    const scene = World.levels.current;
    const entities =
      scene !== null && scene !== undefined && scene.entities !== undefined
        ? scene.entities
        : null;

    // drop a stale selection (entity removed, or scene/store swapped).
    if (DebugInspector._id !== -1) {
      if (
        entities !== DebugInspector._entities ||
        entities === null ||
        !entities.isValid(DebugInspector._id)
      ) {
        DebugInspector.select(null, -1);
      }
    }

    // pick only while the overlay is open, the cursor isn't over it, and the
    // scene has a store + camera.
    if (!Debug.isOpen() || entities === null) return;
    if (scene.camera === undefined) return;
    if (is_mouse_over_debug_overlay()) return;
    if (!UIPointer.pressed) return;

    const cam = scene.camera;
    // pitch-aware ground-plane unprojection (GUI cursor → world) — the old
    // linear view-rect mapping ignored camera pitch (see Camera.unproject)
    const cur = cam.cursorWorld();
    const id = Query.nearest(entities, cur.x, cur.y, {
      maxDist: DebugInspector.pickRadius,
    });
    if (id !== -1) DebugInspector.select(entities, id);
  },

  draw() {
    if (!Debug.enabled || !Debug.isOpen() || DebugInspector._id === -1) return;
    const entities = DebugInspector._entities;
    if (entities === null || !entities.isValid(DebugInspector._id)) return;
    const scene = World.levels.current;
    if (scene === null || scene === undefined || scene.camera === undefined)
      return;
    const pos = entities.get(Position, DebugInspector._id);
    if (pos === undefined) return;

    const cam = scene.camera;
    const gw = display_get_gui_width();
    const gh = display_get_gui_height();
    // world → surface px via the pitch-aware projection, then surface → GUI
    // scale (the old linear view-rect mapping drew the marker off the entity
    // under a pitched camera)
    const p = cam.project(pos.x, pos.y, 0);
    const sx = (p.x / surface_get_width(application_surface)) * gw;
    const sy = (p.y / surface_get_height(application_surface)) * gh;
    const r = DebugInspector.markerR;
    const c = DebugInspector.highlightColor;

    const a0 = draw_get_alpha();
    draw_set_alpha(1);
    draw_rectangle_color(sx - r, sy - r, sx + r, sy + r, c, c, c, c, true);
    draw_line_color(sx - r, sy, sx + r, sy, c, c);
    draw_line_color(sx, sy - r, sx, sy + r, c, c);
    draw_set_alpha(a0);
  },
};
