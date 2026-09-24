/**
 * Build mode: placing and deconstructing tiles and entities on an allied settlement's map (owned
 * by the player's faction or an ally); an unsettled level is founded through claim(). A shape
 * brush acts on every cell it spans as ONE build — the whole cost paid up front, each solid layer
 * remeshed once; an entity item is always single-cell. A drag pressed on the grid stays the
 * grid's until its release, wherever the cursor goes.
 *
 * build() returns the panel handle holding the mode's whole state. `active` (armed AND the build
 * context owning input) is the flag anything gating on build mode reads; update() recomputes it
 * each frame, before any draw.
 *
 * DEV: F6 toggles free build (no settlement gate, no cost) and adds a `capture` shape that writes
 * the dragged rect out as a prefab literal.
 *
 * Scene contract: level, playerId, ui, window, mouseWorld. The level's build record under KEY —
 * the player-built tiles and entities by "gx,gy", the deconstructable set — is seeded blank on
 * first use and saved with the level.
 */
globalThis.BuildMode = {
  KEY: "build", // a data key: a save holds it

  of(level) {
    return level.entities.of(level.self, BuildMode.KEY, () => ({ built: {}, builtEnts: {} }));
  },

  // DEV free build: no gate, no cost, no refund — structures built to be captured, not paid for.
  // Module-scope, not on the panel: a session-wide toggle a HUD rebuild must not clear.
  free: false,
  // in the shape row's order
  SHAPES: [
    { id: "cell", labelKey: "BUILD_SHAPE_CELL" },
    { id: "rect", labelKey: "BUILD_SHAPE_RECT" },
    { id: "frame", labelKey: "BUILD_SHAPE_FRAME" },
    { id: "line", labelKey: "BUILD_SHAPE_LINE" },
    { id: "capture", labelKey: "BUILD_SHAPE_CAPTURE", dev: true },
  ],
  RESOURCE: "wood",
  // a map builds when its Settlement's owner is this faction or an ally
  FACTION: "player",

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
    const wood = Bag.count(inv, BuildMode.RESOURCE);
    const it = panel.item;
    const text = I18n.text(
      "BUILD_STATUS",
      wood,
      I18n.text(it.labelKey),
      it.cost,
      I18n.text(BuildMode._shape(panel.shape).labelKey),
    );
    return BuildMode.free ? I18n.text("BUILD_FREE") + "   ·   " + text : text;
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
      BuildMode.free = !BuildMode.free;
      Toast.push(
        I18n.text(BuildMode.free ? "BUILD_FREE_ON" : "BUILD_FREE_OFF"),
        { type: "info" },
      );
    }
    // opens only on an allied map or under free build; closing is free
    if (Input.get("build").pressed()) {
      if (panel.armed) panel.armed = false;
      else if (BuildMode.free || BuildMode._allied(scene)) panel.armed = true;
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
          BuildMode._tryPlace(scene, panel, cell.x, cell.y);
        else panel.drag = { x: cell.x, y: cell.y, remove: false };
      } else if (Input.get("buildRemove").pressed()) {
        if (panel.shape === "cell") BuildMode._tryRemove(scene, cell.x, cell.y);
        else panel.drag = { x: cell.x, y: cell.y, remove: true };
      }
      return;
    }
    if (BuildMode._dragHeld(drag)) return;

    panel.drag = undefined;
    const shape = panel.shape;
    const cells = BuildMode._shapeCells(shape, drag.x, drag.y, cell.x, cell.y);
    if (drag.remove) BuildMode._removeCells(scene, panel, cells);
    else if (shape === "capture")
      BuildMode._capture(scene, drag.x, drag.y, cell.x, cell.y);
    else BuildMode._placeCells(scene, panel, cells);
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

  /**
   * One build over the placeable cells: the whole cost is paid up front or nothing is placed —
   * half a wall is worse than none.
   */
  _placeCells(scene, panel, cells) {
    const item = panel.item;
    if (item.kind !== "tile") return;
    const todo = [];
    for (let i = 0; i < cells.length; i++)
      if (BuildMode._cellFree(scene, panel, cells[i][0], cells[i][1]))
        todo.push(cells[i]);
    if (todo.length === 0) return;
    const cost = todo.length * item.cost;
    if (!BuildMode.free) {
      const inv = scene.level.entities.require(scene.playerId, Inventory);
      if (!Bag.has(inv, BuildMode.RESOURCE, cost)) {
        Toast.push(I18n.text("BUILD_NO_WOOD", cost), { type: "warn" });
        return;
      }
      Bag.remove(inv, BuildMode.RESOURCE, cost);
    }
    const remesh = {};
    for (let i = 0; i < todo.length; i++) {
      const solid = BuildMode.applyItem(scene, todo[i][0], todo[i][1], item, {
        deferRemesh: true,
      });
      if (solid === true) remesh[item.layer] = true;
    }
    BuildMode.remeshLayers(scene, remesh);
    scene.window.dirty = true;
    Log.info(`built ${todo.length}x ${item.id} (${panel.shape})`);
  },

  _removeCells(scene, panel, cells) {
    const remesh = {};
    let n = 0;
    for (let i = 0; i < cells.length; i++)
      if (BuildMode._tryRemove(scene, cells[i][0], cells[i][1], remesh)) n++;
    BuildMode.remeshLayers(scene, remesh);
    if (n > 0) Log.info(`removed ${n} (${panel.shape})`);
  },

  /** Remesh every solid layer keyed in `remesh`: a batch's one remesh. */
  remeshLayers(scene, remesh) {
    const keys = Object.keys(remesh);
    const rt = ColonyMap.runtime(scene.level);
    const colliders = ColonyMap.of(scene.level).colliders;
    for (let i = 0; i < keys.length; i++)
      TileEdit.remesh(
        scene.level.entities,
        scene.level.grid,
        rt[keys[i] + "Layer"],
        colliders[keys[i]],
      );
  },

  /** DEV: write the dragged rect to the save dir as a prefab literal. */
  _capture(scene, x0, y0, x1, y1) {
    const ax = Math.min(x0, x1);
    const ay = Math.min(y0, y1);
    const plan = Blueprint.capture(
      scene,
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

  _allied(scene) {
    const owner = Settlement.owner(scene.level);
    return (
      owner !== undefined && Diplomacy.isAlly(owner, BuildMode.FACTION)
    );
  },

  /** Can the selected item stand at (gx, gy), cost aside — the per-cell test a shape runs. */
  _cellFree(scene, panel, gx, gy) {
    const grid = scene.level.grid;
    if (!BuildMode.free && !BuildMode._allied(scene)) return false;
    const rt = ColonyMap.runtime(scene.level);
    const lkeys = contentBuild.tileLayers();
    for (let i = 0; i < lkeys.length; i++)
      if (TileEdit.occupied(rt[lkeys[i] + "Layer"], gx, gy)) return false;
    if (BuildMode.of(scene.level).builtEnts[gx + "," + gy] !== undefined)
      return false;
    const item = panel.item;
    // a crop only where its species can root
    if (item.species !== undefined) {
      if (
        !Flora.canRoot(
          scene.level,
          contentFlora.get(item.species),
          gx,
          gy,
        )
      )
        return false;
    }
    // a solid item never lands on the player's own cell
    const solid = !(
      item.kind === "tile" && contentTiles.get(item.layer).solid !== true
    );
    if (solid) {
      const pp = scene.level.entities.require(scene.playerId, Position);
      const pc = grid.worldToGrid(pp.x, pp.y);
      if (pc.x === gx && pc.y === gy) return false;
    }
    return true;
  },

  /** _cellFree plus the cost of one placement. */
  _canBuild(scene, panel, gx, gy) {
    if (!BuildMode._cellFree(scene, panel, gx, gy)) return false;
    if (BuildMode.free) return true;
    const inv = scene.level.entities.require(scene.playerId, Inventory);
    return Bag.has(inv, BuildMode.RESOURCE, panel.item.cost);
  },

  _tryPlace(scene, panel, gx, gy) {
    if (!BuildMode._canBuild(scene, panel, gx, gy)) return;
    const item = panel.item;
    if (!BuildMode.free) {
      const inv = scene.level.entities.get(scene.playerId, Inventory);
      Bag.remove(inv, BuildMode.RESOURCE, item.cost);
    }
    BuildMode.applyItem(scene, gx, gy, item);
    scene.window.dirty = true;
    Log.info(`built ${item.id} at ${gx},${gy}`);
  },

  /**
   * The spawn descriptor for an entity item at a cell: the item's `spawn` fields over the build
   * defaults. An `orient` item turns vertical between walls above and below, the run it closes.
   */
  descriptor(scene, item, gx, gy) {
    const s = { preset: "prop", gx, gy, label: I18n.text(item.labelKey) };
    const spawn = item.spawn;
    for (const k in spawn) s[k] = spawn[k];
    if (item.orient === true) {
      const wall = ColonyMap.runtime(scene.level).wallLayer;
      s.vertical =
        TileEdit.occupied(wall, gx, gy - 1) &&
        TileEdit.occupied(wall, gx, gy + 1);
    }
    return s;
  },

  // The placement core: no cost or validity gate, no inventory — the caller decides. Records the
  // cell in the build record.
  //   opts.record      restore this exact Row instead of a fresh descriptor, moved to the cell.
  //   opts.deferRemesh skip the solid-collider remesh; the caller remeshes once for a batch.
  // Returns the entity id for an entity, else whether a solid tile was placed (a deferred
  // caller's pending remesh).
  applyItem(scene, gx, gy, item, opts = {}) {
    const level = scene.level;
    const grid = level.grid;
    const key = gx + "," + gy;
    const rec = BuildMode.of(level);
    if (item.kind === "tile") {
      // `mat` picks a per-cell material type
      const rt = ColonyMap.runtime(level);
      const layer = rt[item.layer + "Layer"];
      const type =
        item.mat !== undefined
          ? rt[item.layer + "Types"][item.mat]
          : rt[item.layer + "Type"];
      TileEdit.set(layer, gx, gy, type);
      Grassland.cut(level, gx, gy);
      const solid = contentTiles.get(item.layer).solid === true;
      // BUG: nested, not `solid && …` — the short-circuit corrupts its left operand, read by
      // the return below (docs/GMRT.md #15549)
      if (opts.deferRemesh !== true) {
        if (solid)
          TileEdit.remesh(
            level.entities,
            grid,
            layer,
            ColonyMap.of(level).colliders[item.layer],
          );
      }
      rec.built[key] = item.id;
      return solid;
    }
    // a built entity is an ordinary one: it persists like any other
    let id;
    if (opts.record !== undefined) {
      const wp = grid.gridToWorld(gx, gy);
      id = Row.restore(scene.level.entities, opts.record, {
        [Position]: { x: wp.x, y: wp.y, z: 0 },
      });
    } else {
      id = ColonySpawn.spawnEntity(
        scene.level.entities,
        grid,
        BuildMode.descriptor(scene, item, gx, gy),
      );
    }
    rec.builtEnts[key] = { ent: id, itemId: item.id };
    Grassland.cut(level, gx, gy);
    return id;
  },

  /**
   * Deconstruct what the player built at (gx, gy); returns whether anything was removed. Given
   * `remesh`, a solid tile's remesh is recorded there for the batch instead of run at once.
   */
  _tryRemove(scene, gx, gy, remesh) {
    const key = gx + "," + gy;
    const level = scene.level;
    const grid = level.grid;
    const rec = BuildMode.of(level);
    const rt = ColonyMap.runtime(level);
    // an entity sits on top of a tile, so it goes first
    const ent = rec.builtEnts[key];
    if (ent !== undefined) {
      // a slotted module is in no inventory: return it or deconstructing deletes it
      if (scene.level.entities.isValid(ent.ent)) {
        const st = scene.level.entities.get(ent.ent, Interaction);
        if (st !== undefined && st.module !== undefined && st.module !== "") {
          Bag.add(scene.level.entities.require(scene.playerId, Inventory), st.module, 1);
        }
        // spill the contents first, else removing the entity deletes them
        ColonyCombat.spillLoot(scene, ent.ent);
        scene.level.entities.remove(ent.ent);
      }
      BuildMode._refund(scene, ent.itemId);
      delete rec.builtEnts[key];
      scene.window.dirty = true;
      Log.info(`removed ${ent.itemId} at ${gx},${gy}`);
      return true;
    }
    const tileId = rec.built[key];
    if (tileId === undefined) return false; // only player-built cells are deconstructable
    const item = contentBuild.item(tileId);
    const lkey = item !== undefined ? item.layer : "floor"; // a stale id: non-solid, safe
    TileEdit.clear(rt[lkey + "Layer"], gx, gy);
    if (contentTiles.get(lkey).solid === true) {
      if (remesh !== undefined) remesh[lkey] = true;
      else
        TileEdit.remesh(
          level.entities,
          grid,
          rt[lkey + "Layer"],
          ColonyMap.of(level).colliders[lkey],
        );
    }
    BuildMode._refund(scene, tileId);
    delete rec.built[key];
    scene.window.dirty = true;
    Log.info(`removed ${tileId} at ${gx},${gy}`);
    return true;
  },

  _refund(scene, itemId) {
    if (BuildMode.free) return; // nothing was paid
    const item = contentBuild.item(itemId);
    const inv = scene.level.entities.require(scene.playerId, Inventory);
    if (item !== undefined) Bag.add(inv, BuildMode.RESOURCE, item.cost);
  },

  /**
   * Per frame: drop built entities destroyed in combat from the build record, freeing the cell
   * and keeping a dead handle out of the save. No refund.
   */
  reapDestroyed(scene) {
    const entities = scene.level.entities;
    const builtEnts = BuildMode.of(scene.level).builtEnts;
    const keys = Object.keys(builtEnts);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const e = builtEnts[k];
      if (!entities.isValid(e.ent)) {
        delete builtEnts[k];
        continue;
      }
      const hp = entities.get(e.ent, Health);
      if (hp !== undefined && hp.hp <= 0) {
        entities.remove(e.ent);
        delete builtEnts[k];
        const item = contentBuild.item(e.itemId);
        const label = item !== undefined ? I18n.text(item.labelKey) : e.itemId;
        Toast.push(I18n.text("BUILD_DESTROYED", label), { type: "warn" });
        Log.info(`built ${e.itemId} destroyed at ${k}`);
      }
    }
  },

  /**
   * Found the player's settlement over the level at a survey post, then spend the post — also on
   * an already-settled level, so it never re-founds.
   */
  claim(scene, postId) {
    const s = Settlement.found(scene.level, {
      name: I18n.text("SETTLEMENT_DEFAULT_NAME"),
      factionId: BuildMode.FACTION,
    });
    if (s !== undefined) {
      Toast.push(I18n.text("SETTLEMENT_FOUNDED"), { type: "success" });
      Log.info(`founded settlement over ${scene.level.id}`);
    }
    scene.level.entities.detach(postId, Interaction);
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
    const rec = BuildMode.of(scene.level);
    if (rec.built[key] !== undefined || rec.builtEnts[key] !== undefined)
      col = c_yellow;
    else
      col = BuildMode._canBuild(scene, panel, cell.x, cell.y) ? c_lime : c_red;

    draw_set_color(col);
    draw_set_alpha(0.3);
    draw_rectangle(wx, wy, wx + grid.cellWidth, wy + grid.cellHeight, false);
    draw_set_alpha(1);
    draw_rectangle(wx, wy, wx + grid.cellWidth, wy + grid.cellHeight, true);
    draw_set_color(c_white);
  },
};
