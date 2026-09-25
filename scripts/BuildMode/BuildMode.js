/**
 * Build mode: the palette, the shape brush and its world highlight. A shape brush hands every
 * cell it spans over as ONE build; an entity item is always single-cell. A drag pressed on the
 * grid stays the grid's until its release, wherever the cursor goes.
 *
 * build() returns the panel handle holding the mode's whole state. `active` (armed AND the build
 * context owning input) is the flag anything gating on build mode reads; update() recomputes it
 * each frame, before any draw.
 *
 * DEV: F6 toggles free build and adds a `capture` shape that writes the dragged rect out as a
 * prefab literal.
 *
 * Scene contract: level, playerId, ui, window, mouseWorld.
 */
globalThis.BuildMode = {
  // in the shape row's order
  SHAPES: [
    { id: "cell", labelKey: "BUILD_SHAPE_CELL" },
    { id: "rect", labelKey: "BUILD_SHAPE_RECT" },
    { id: "frame", labelKey: "BUILD_SHAPE_FRAME" },
    { id: "line", labelKey: "BUILD_SHAPE_LINE" },
    { id: "capture", labelKey: "BUILD_SHAPE_CAPTURE", dev: true },
  ],

  /** Build the HUD and return the panel handle; once per scene. */
  build(scene) {
    const panel = {
      el: null,
      bar: null,
      armed: false,
      active: false, // see the header
      item: contentBuild.CATEGORIES[0].items[0],
      shape: "cell", // SHAPES id
      drag: undefined, // { x, y, remove } — the anchor cell while a shape drag is held
      cell: undefined, // last hovered cell
    };

    // Placement reads the build actions, which Input mutes while the HUD holds the pointer, so a
    // click on the palette never reaches the grid.
    const wrap = new UIElement({
      positionType: "absolute",
      left: 0,
      right: 0,
      bottom: 18,
      alignItems: "center",
    });
    const col = new UIElement({
      width: 760,
      gap: FacetTheme.gapSm,
      alignItems: "center",
    });

    // Topmost: the bar's open flyout covers the row right above it, so the status line sits there.
    const shapeRow = new UIElement({
      width: "100%",
      height: 30,
      flexDirection: "row",
      justifyContent: "center",
      gap: FacetTheme.gapSm,
    });
    for (let i = 0; i < BuildMode.SHAPES.length; i++) {
      const sh = BuildMode.SHAPES[i];
      if (sh.dev === true && !DEV_MODE) continue;
      shapeRow.insertChild(
        facetButton(
          I18n.textRef(sh.labelKey),
          () => {
            panel.shape = sh.id;
            panel.drag = undefined;
          },
          { width: 110, height: 28 },
        ),
      );
    }
    col.insertChild(shapeRow);

    const statusRow = new UIElement({ width: "100%", height: 22 });
    statusRow.insertChild(
      facetLabel(() => BuildMode._statusText(scene, panel), {
        halign: fa_center,
        color: FacetTheme.text,
      }),
    );
    col.insertChild(statusRow);

    const cats = [];
    for (let c = 0; c < contentBuild.CATEGORIES.length; c++) {
      const cat = contentBuild.CATEGORIES[c];
      const items = [];
      for (let i = 0; i < cat.items.length; i++) {
        const it = cat.items[i];
        items.push({
          label: () => I18n.text(it.labelKey) + "  (" + it.cost + ")",
          onSelect: () => {
            panel.item = it;
          },
        });
      }
      cats.push({ label: I18n.textRef(cat.labelKey), items });
    }
    const bar = facetCatBar(cats, { width: 760, selCat: 0, selItem: 0 });
    col.insertChild(bar);
    panel.bar = bar;

    wrap.insertChild(col);
    wrap.enabled = false;
    panel.el = wrap;
    scene.ui.insertChild(wrap);
    return panel;
  },

  _statusText(scene, panel) {
    const inv = scene.level.entities.require(scene.playerId, Inventory);
    const wood = Bag.count(inv, Build.RESOURCE);
    const it = panel.item;
    const text = I18n.text(
      "BUILD_STATUS",
      wood,
      I18n.text(it.labelKey),
      it.cost,
      I18n.text(BuildMode._shape(panel.shape).labelKey),
    );
    return Build.free ? I18n.text("BUILD_FREE") + "   ·   " + text : text;
  },

  /** Falls back to the first shape. */
  _shape(id) {
    for (let i = 0; i < BuildMode.SHAPES.length; i++)
      if (BuildMode.SHAPES[i].id === id) return BuildMode.SHAPES[i];
    return BuildMode.SHAPES[0];
  },

  /** Per frame, after the sim. */
  update(scene, panel) {
    if (DEV_MODE && Input.keyPressed(vk_f6)) {
      Build.free = !Build.free;
      Toast.push(
        I18n.text(Build.free ? "BUILD_FREE_ON" : "BUILD_FREE_OFF"),
        { type: "info" },
      );
    }
    // opens only where building is allowed or under free build; closing is free
    if (Input.get("build").pressed()) {
      if (panel.armed) panel.armed = false;
      else if (Build.free || Build.allied(scene.level)) panel.armed = true;
      else Toast.push(I18n.text("BUILD_NEED_SETTLEMENT"), { type: "info" });
    }
    // a higher-priority input context (an open window) pauses building
    const on = panel.armed && InputContext.is("build");
    panel.active = on;
    panel.el.enabled = on;
    if (!on) {
      panel.bar.catbar.close();
      panel.drag = undefined;
      return;
    }

    const grid = scene.level.grid;
    const drag = panel.drag;

    // mouse_x/mouse_y are wrong under the pitched camera
    const cell = grid.worldToGrid(scene.mouseWorld.x, scene.mouseWorld.y);
    panel.cell = cell;
    if (
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x >= grid.cols ||
      cell.y >= grid.rows
    ) {
      if (drag !== undefined && !BuildMode._dragHeld(drag))
        panel.drag = undefined; // released off the grid: cancelled
      return;
    }

    if (drag === undefined) {
      if (Input.get("buildPlace").pressed()) {
        if (BuildMode._single(panel))
          BuildMode._place(scene, panel, [[cell.x, cell.y]]);
        else panel.drag = { x: cell.x, y: cell.y, remove: false };
      } else if (Input.get("buildRemove").pressed()) {
        if (panel.shape === "cell") BuildMode._remove(scene, [[cell.x, cell.y]]);
        else panel.drag = { x: cell.x, y: cell.y, remove: true };
      }
      return;
    }
    if (BuildMode._dragHeld(drag)) return;

    panel.drag = undefined;
    const shape = panel.shape;
    const cells = BuildMode._shapeCells(shape, drag.x, drag.y, cell.x, cell.y);
    if (drag.remove) BuildMode._remove(scene, cells);
    else if (shape === "capture")
      BuildMode._capture(scene, drag.x, drag.y, cell.x, cell.y);
    else BuildMode._place(scene, panel, cells);
  },

  /** The grid owns its press, so this reads true over the HUD too. */
  _dragHeld(drag) {
    return drag.remove
      ? Input.get("buildRemove").down()
      : Input.get("buildPlace").down();
  },

  /** An entity item never tiles a shape. */
  _single(panel) {
    const shape = panel.shape;
    if (shape === "cell") return true;
    if (shape === "capture") return false;
    return panel.item.kind === "entity";
  },

  /** The [gx, gy] cells a shape spans between two corner cells, inclusive. */
  _shapeCells(shape, x0, y0, x1, y1) {
    const out = [];
    if (shape === "line") {
      let x = x0;
      let y = y0;
      const dx = Math.abs(x1 - x0);
      const dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      let more = true;
      while (more) {
        out.push([x, y]);
        if (x === x1 && y === y1) more = false;
        else {
          const e2 = 2 * err;
          if (e2 >= dy) {
            err += dy;
            x += sx;
          }
          if (e2 <= dx) {
            err += dx;
            y += sy;
          }
        }
      }
      return out;
    }
    const ax = Math.min(x0, x1);
    const bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1);
    const by = Math.max(y0, y1);
    for (let y = ay; y <= by; y++)
      for (let x = ax; x <= bx; x++) {
        if (shape === "frame")
          if (x !== ax && x !== bx && y !== ay && y !== by) continue;
        out.push([x, y]);
      }
    return out;
  },

  /** One build over the cells, its refusal shown. */
  _place(scene, panel, cells) {
    const r = Build.place(scene.level, scene.playerId, panel.item, cells);
    if (r.reason !== "")
      Toast.push(I18n.text(r.reason, r.cost), { type: "warn" });
    if (r.placed > 0) scene.window.dirty = true;
  },

  _remove(scene, cells) {
    if (Build.remove(scene.level, scene.playerId, cells) > 0)
      scene.window.dirty = true;
  },

  /** Per frame, whether armed or not: reap the destroyed builds, each one shown. */
  reapDestroyed(scene) {
    const lost = Build.reap(scene.level);
    for (let i = 0; i < lost.length; i++) {
      const item = contentBuild.item(lost[i]);
      const label = item !== undefined ? I18n.text(item.labelKey) : lost[i];
      Toast.push(I18n.text("BUILD_DESTROYED", label), { type: "warn" });
    }
  },

  /** DEV: write the dragged rect to the save dir as a prefab literal. */
  _capture(scene, x0, y0, x1, y1) {
    const ax = Math.min(x0, x1);
    const ay = Math.min(y0, y1);
    const plan = Blueprint.capture(
      scene.level,
      ax,
      ay,
      Math.max(x0, x1),
      Math.max(y0, y1),
    );
    const name = `prefab_${scene.level.id}_${ax}_${ay}.json`;
    if (Blueprint.export(plan, name))
      Toast.push(I18n.text("BUILD_CAPTURED", plan.cols, plan.rows, name), {
        type: "success",
      });
    else Toast.push(I18n.text("BUILD_CAPTURE_FAIL"), { type: "error" });
    Log.info(
      `captured ${plan.cols}x${plan.rows} → ${name} — ${plan.tiles.length} channel(s), ${plan.spawns.length} spawn(s)`,
    );
  },

  /** World-space highlight of the hovered cell, or of the cells a held drag would act on. */
  drawWorld(scene, panel) {
    if (!panel.active) return;
    const cell = panel.cell;
    if (cell === undefined) return;
    const grid = scene.level.grid;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;

    const drag = panel.drag;
    if (drag !== undefined) {
      // clamped, so a drag past the edge previews to the edge
      const cx = Math.min(Math.max(cell.x, 0), grid.cols - 1);
      const cy = Math.min(Math.max(cell.y, 0), grid.rows - 1);
      const shape = panel.shape;
      const cells = BuildMode._shapeCells(shape, drag.x, drag.y, cx, cy);
      let col = c_lime;
      if (drag.remove) col = c_yellow;
      else if (shape === "capture") col = c_aqua;
      draw_set_color(col);
      draw_set_alpha(0.25);
      for (let i = 0; i < cells.length; i++) {
        const wx = cells[i][0] * cw;
        const wy = cells[i][1] * ch;
        draw_rectangle(wx, wy, wx + cw, wy + ch, false);
      }
      draw_set_alpha(1);
      const x1 = Math.min(drag.x, cx) * cw;
      const y1 = Math.min(drag.y, cy) * ch;
      const x2 = (Math.max(drag.x, cx) + 1) * cw;
      const y2 = (Math.max(drag.y, cy) + 1) * ch;
      draw_rectangle(x1, y1, x2, y2, true);
      draw_set_color(c_white);
      return;
    }

    if (cell.x < 0 || cell.y < 0 || cell.x >= grid.cols || cell.y >= grid.rows)
      return;

    const key = cell.x + "," + cell.y;
    const wx = cell.x * grid.cellWidth;
    const wy = cell.y * grid.cellHeight;
    let col;
    const rec = Build.of(scene.level);
    if (rec.built[key] !== undefined || rec.builtEnts[key] !== undefined)
      col = c_yellow;
    else
      col = Build.canPlace(scene.level, scene.playerId, panel.item, cell.x, cell.y)
        ? c_lime
        : c_red;

    draw_set_color(col);
    draw_set_alpha(0.3);
    draw_rectangle(wx, wy, wx + grid.cellWidth, wy + grid.cellHeight, false);
    draw_set_alpha(1);
    draw_rectangle(wx, wy, wx + grid.cellWidth, wy + grid.cellHeight, true);
    draw_set_color(c_white);
  },
};
