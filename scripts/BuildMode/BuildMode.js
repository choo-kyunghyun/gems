/**
 * Gated to an ALLIED Settlement — the level's (a settlement is a whole map), owned by the player's
 * faction or an ally of it (Diplomacy.isAlly). An unsettled level is founded by pressing E at a
 * Survey Post (Interactable routes to BuildMode.claim → Settlement.found). Build mode only OPENS
 * on an allied map, and placement is gated to it too. The palette (a bottom-center facetCatBar) is
 * contentBuild's catalog: an item is a TILE (TileLayer via TileEdit) or an ENTITY (its `spawn`
 * fields through descriptor() to ColonySpawn.spawnEntity); the `buildPlace`
 * (LMB) action places, `buildRemove` (RMB) deconstructs — "build"-context actions from the app
 * keymap (ColonyKeymap.bind), read through Input, which mutes them while the bar (or any
 * widget) holds the pointer: a click on the palette never reaches the grid behind it, with no
 * rect guard of its own. The SHAPE row above the bar sets the brush's footprint: `cell` acts on
 * the hovered cell at once, `rect`/`frame`/`line` drag from a press to a release and act on every
 * cell the shape spans as ONE build (the whole cost paid up front, solid layers remeshed once) —
 * a drag pressed on the grid stays the grid's until its release wherever the cursor goes (Input's
 * pointer ownership); an entity item is always single-cell.
 *
 * build() returns the PANEL HANDLE holding this mode's whole state (`el`/`bar` the HUD, `armed`
 * the B toggle, `active` armed AND the build context owning input, `item`/`shape`/`drag`/`cell`
 * the brush) — the scene keeps that one field and hands it back to every member, the shape a
 * `*UI` page already takes (see Window). `active` is the flag anything gating on build mode
 * reads (Interactable, drawWorld); update() recomputes it each frame, before any draw.
 *
 * DEV authoring: F6 toggles FREE build (no settlement gate, no wood) and the shape row gains
 * `capture` — drag a rect and Blueprint.capture writes what stands there out as the prefab literal
 * contentPrefabs takes (the scratch site is the canvas for it — contentSites).
 *
 * scene contract: level, playerId, ui, window, mouseWorld. Off the level: the map runtime
 * (ColonyMap.runtime — the layer handles this edits and the tilePasses it marks dirty), the map
 * record (ColonyMap.of — the collider lists a remesh refills) and this module's own record under
 * KEY, the player's builds: `built` "gx,gy" → tile item id (the deconstructable tiles) and
 * `builtEnts` "gx,gy" → { ent, itemId } (the deconstructable built entities), seeded blank on a
 * level's first use and saved with it.
 */
globalThis.BuildMode = {
  KEY: "build", // its token on the level's own entity — a data key (a save holds it)

  /** The level's build record — { built, builtEnts } — seeded blank. */
  of(level) {
    return level.entities.of(level.self, BuildMode.KEY, () => ({ built: {}, builtEnts: {} }));
  },

  // DEV free build (F6): no settlement gate, no wood, no refund — the authoring mode, where a
  // structure is built to be captured (Blueprint), not paid for. Never reachable in release.
  // Module-scope, not on the panel: a session-wide authoring toggle a HUD rebuild must not clear.
  free: false,
  // the brush shapes, in the shape row's order; `dev` rows only show in DEV_MODE
  SHAPES: [
    { id: "cell", labelKey: "BUILD_SHAPE_CELL" },
    { id: "rect", labelKey: "BUILD_SHAPE_RECT" },
    { id: "frame", labelKey: "BUILD_SHAPE_FRAME" },
    { id: "line", labelKey: "BUILD_SHAPE_LINE" },
    { id: "capture", labelKey: "BUILD_SHAPE_CAPTURE", dev: true },
  ],
  RESOURCE: "wood",
  // the player's faction: a map builds when its Settlement's owner is it or an ally (Game policy)
  FACTION: "player",

  /** build the HUD and return the panel handle. call once from create(). */
  build(scene) {
    const panel = {
      el: null, // the HUD root
      bar: null, // the catalog bar (its flyout closes when the mode leaves)
      armed: false, // the B toggle
      active: false, // armed AND the build context owns input — see the header
      item: contentBuild.CATEGORIES[0].items[0], // selected catalog item (default Wall)
      shape: "cell", // the brush footprint (SHAPES id)
      drag: undefined, // { x, y, remove } — the anchor cell while a shape drag is held
      cell: undefined, // last hovered cell, for drawWorld
    };

    // bottom-center HUD: status line over the build bar. Placement is on the world grid through
    // the build actions, which Input mutes while the bar holds the pointer (see the header).
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

    // shape row: one button per brush footprint (the DEV capture tool among them in DEV_MODE).
    // Topmost — the catbar's open flyout reaches up over the row right above the bar, which
    // stays the status line as before.
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

    // map the catalog to facetCatBar's shape; each item's onSelect sets the active brush.
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

  /** a SHAPES row by id */
  _shape(id) {
    for (let i = 0; i < BuildMode.SHAPES.length; i++)
      if (BuildMode.SHAPES[i].id === id) return BuildMode.SHAPES[i];
    return BuildMode.SHAPES[0];
  },

  /**
   * per-frame: toggle on B, then (while active) place on buildPlace / deconstruct on buildRemove
   * at the hovered cell. call from step() after Interactable.update, after the sim.
   */
  update(scene, panel) {
    // DEV: F6 toggles free build (no settlement gate, no wood)
    if (DEV_MODE && Input.keyPressed(vk_f6)) {
      BuildMode.free = !BuildMode.free;
      Toast.push(
        I18n.text(BuildMode.free ? "BUILD_FREE_ON" : "BUILD_FREE_OFF"),
        { type: "info" },
      );
    }
    // B toggles build mode, but it only OPENS on an allied map (the level's Settlement owned by
    // the player's faction or an ally) — "you can only build in an allied settlement" — or under
    // free build. Closing is free.
    if (Input.get("build").pressed()) {
      if (panel.armed) panel.armed = false;
      else if (BuildMode.free || BuildMode._allied(scene)) panel.armed = true;
      else Toast.push(I18n.text("BUILD_NEED_SETTLEMENT"), { type: "info" });
    }
    // active only when toggled on AND the build context owns input — an open window makes the
    // context "window" (priority over build), so building pauses and window clicks can't place/remove.
    const on = panel.armed && InputContext.is("build");
    panel.active = on;
    panel.el.enabled = on;
    if (!on) {
      panel.bar.catbar.close(); // collapse any open flyout when leaving build mode
      panel.drag = undefined;
      return;
    }

    const grid = scene.level.grid;
    const drag = panel.drag;

    // scene-latched world cursor (pitch-aware) — mouse_x/mouse_y are wrong under the pitched camera
    const cell = grid.worldToGrid(scene.mouseWorld.x, scene.mouseWorld.y);
    panel.cell = cell;
    if (
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x >= grid.cols ||
      cell.y >= grid.rows
    ) {
      if (drag !== undefined && !BuildMode._dragHeld(drag))
        panel.drag = undefined; // let go off the grid: cancelled
      return;
    }

    if (drag === undefined) {
      // a press: a single-cell brush acts at once, a shape anchors a drag. A press the UI took
      // (the bar, its flyout, any hovered widget) reads false here — Input muted it.
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
    if (BuildMode._dragHeld(drag)) return; // still dragging — drawWorld previews the shape

    // the release: act on every cell the shape spans between the anchor and this cell
    panel.drag = undefined;
    const shape = panel.shape;
    const cells = BuildMode._shapeCells(shape, drag.x, drag.y, cell.x, cell.y);
    if (drag.remove) BuildMode._removeCells(scene, panel, cells);
    else if (shape === "capture")
      BuildMode._capture(scene, drag.x, drag.y, cell.x, cell.y);
    else BuildMode._placeCells(scene, panel, cells);
  },

  /** is the button a drag started on still held — the grid's press, so it reads true over the HUD too */
  _dragHeld(drag) {
    return drag.remove
      ? Input.get("buildRemove").down()
      : Input.get("buildPlace").down();
  },

  /**
   * does the brush act on one cell at once: the cell shape, or an entity item under any brush
   * but capture (an entity never tiles a shape)
   */
  _single(panel) {
    const shape = panel.shape;
    if (shape === "cell") return true;
    if (shape === "capture") return false;
    return panel.item.kind === "entity";
  },

  /**
   * The cells a shape spans between two corner cells (inclusive), as [gx, gy] pairs: a filled
   * rect, its `frame` (the perimeter — a wall run around a room), or a Bresenham `line`.
   */
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
   * Place the selected TILE item over `cells` as ONE build: only the placeable cells count, the
   * whole wood cost is paid up front (nothing partial — half a wall is worse than none), and each
   * solid layer touched is remeshed once at the end.
   */
  _placeCells(scene, panel, cells) {
    const item = panel.item;
    if (item.kind !== "tile") return; // an entity item never reaches here (_single)
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

  /** deconstruct over `cells` as one batch — each solid layer touched remeshed once */
  _removeCells(scene, panel, cells) {
    const remesh = {};
    let n = 0;
    for (let i = 0; i < cells.length; i++)
      if (BuildMode._tryRemove(scene, cells[i][0], cells[i][1], remesh)) n++;
    BuildMode.remeshLayers(scene, remesh);
    if (n > 0) Log.info(`removed ${n} (${panel.shape})`);
  },

  /** remesh the colliders of every solid layer keyed true in `remesh` — a batch's one remesh */
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

  /**
   * DEV: capture the dragged rect as a prefab body (Blueprint.capture) and write it to the save
   * dir as the pretty literal contentPrefabs takes — the authoring exit of the scratch site.
   */
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

  /** is the level an allied settlement — owned by the player's faction or an ally? gates build mode. */
  _allied(scene) {
    const owner = Settlement.owner(scene.level);
    return (
      owner !== undefined && Diplomacy.isAlly(owner, BuildMode.FACTION)
    );
  },

  /**
   * can the selected item stand at (gx, gy) at all: an allied map (or free build), the cell empty
   * across every buildable tile layer and the built entities, and a SOLID item (a wall / any
   * entity — not a floor) not on the player's own cell. The per-cell test a shape runs; wood is
   * the batch's business.
   */
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
    // a crop roots only on its species' ground, and never over a standing body or prop
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

  /** _cellFree plus the wood for ONE placement — shared by the single place + cursor highlight */
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
    BuildMode.applyItem(scene, gx, gy, item); // immediate remesh (deferRemesh unset)
    scene.window.dirty = true;
    Log.info(`built ${item.id} at ${gx},${gy}`);
  },

  /**
   * The spawn descriptor for an entity item at a cell — the catalog's `spawn` fields over the build
   * defaults (a "prop" preset at the cell, the item's label as the entity's name); an `orient` item
   * (the door) turns vertical between walls above and below, the N-S run it closes. Blueprint.capture
   * reads the same descriptor at the live cell, so a captured plan carries what a placement would.
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

  // Place a resolved catalog `item` at a cell — the SHARED placement core of live LMB placement
  // and Blueprint.stamp. It does NOT gate on cost/validity (the caller decides) or
  // touch inventory. Options:
  //   opts.snapshot    restore an EXACT entity from an Row (chest contents, turret
  //                    damage) instead of a fresh descriptor; Position is overridden to this cell.
  //   opts.deferRemesh skip the solid-collider remesh (a batch stamp remeshes once at the end).
  // Updates the level's build record (built / builtEnts). Returns the entity id (entity) or
  // whether a solid tile was placed (so a deferred caller knows that layer's remesh is pending).
  applyItem(scene, gx, gy, item, opts = {}) {
    const level = scene.level;
    const grid = level.grid;
    const key = gx + "," + gy;
    const rec = BuildMode.of(level);
    if (item.kind === "tile") {
      // resolve layer/type by the item's LAYERS key; `mat` picks a material TileType (per-cell
      // wall materials). A solid layer (wall/fence) has its own colliders to remesh (the map
      // record's `colliders`).
      const rt = ColonyMap.runtime(level);
      const layer = rt[item.layer + "Layer"];
      const type =
        item.mat !== undefined
          ? rt[item.layer + "Types"][item.mat]
          : rt[item.layer + "Type"];
      TileEdit.set(layer, gx, gy, type);
      Grassland.cut(level, gx, gy); // built ground kills the grass under it
      const solid = contentTiles.get(item.layer).solid === true;
      // nested, not `solid && …`: the short-circuit corrupts its left operand (docs/GMRT.md
      // #15549) and the return below would read false for a deferred solid tile
      if (opts.deferRemesh !== true) {
        if (solid)
          TileEdit.remesh(
            level.entities,
            grid,
            layer,
            ColonyMap.of(level).colliders[item.layer],
          );
      }
      BuildMode._markTileDirty(scene, item.layer);
      rec.built[key] = item.id;
      return solid;
    }
    // entity: an exact snapshot restore (state preserved) or a fresh descriptor (a new instance);
    // a built prop is identical to a file/streamed one and persists via Row (see ColonyMap).
    let id;
    if (opts.snapshot !== undefined) {
      const wp = grid.gridToWorld(gx, gy);
      id = Row.restore(scene.level.entities, opts.snapshot, {
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
    Grassland.cut(level, gx, gy); // a built prop's pad kills the grass under it too
    return id;
  },

  /**
   * Deconstruct whatever the player built at (gx, gy) — a built entity first, else a built tile.
   * Returns whether anything was removed. With `remesh` (a solid-layer-key → true map) given, a
   * solid tile's collider remesh is recorded there instead of run at once (a batch's one remesh).
   */
  _tryRemove(scene, gx, gy, remesh) {
    const key = gx + "," + gy;
    const level = scene.level;
    const grid = level.grid;
    const rec = BuildMode.of(level);
    const rt = ColonyMap.runtime(level);
    // built entities sit on top of tiles — remove one first if present.
    const ent = rec.builtEnts[key];
    if (ent !== undefined) {
      // a slotted module isn't in any inventory, so return it to the bag or deconstruct deletes it.
      if (scene.level.entities.isValid(ent.ent)) {
        const st = scene.level.entities.get(ent.ent, Interaction);
        if (st !== undefined && st.module !== undefined && st.module !== "") {
          Bag.add(scene.level.entities.require(scene.playerId, Inventory), st.module, 1);
        }
        // spill the entity's Inventory as drops first, else entities.remove silently deletes the
        // contents. no-op without an Inventory; preserves instance uid/mods on the drop.
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
    const lkey = item !== undefined ? item.layer : "floor"; // stale id → floor (non-solid, safe)
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
    BuildMode._markTileDirty(scene, lkey);
    BuildMode._refund(scene, tileId);
    delete rec.built[key];
    scene.window.dirty = true;
    Log.info(`removed ${tileId} at ${gx},${gy}`);
    return true;
  },

  /**
   * RenderTileMap passes are VBO-cached, so a tile edit must markDirty the layer's pass to render
   * (autotiling rebuilds the whole VBO, restyling neighbors). guarded: absent if its sprite failed sprite_exists.
   */
  _markTileDirty(scene, layerKey) {
    const pass = ColonyMap.runtime(scene.level).tilePasses[layerKey];
    if (pass !== undefined) pass.markDirty();
  },

  _refund(scene, itemId) {
    if (BuildMode.free) return; // nothing was paid
    const item = contentBuild.item(itemId);
    const inv = scene.level.entities.require(scene.playerId, Inventory);
    if (item !== undefined) Bag.add(inv, BuildMode.RESOURCE, item.cost);
  },

  /**
   * sweep built entities destroyed in combat (a turret brought to 0 HP) out of the deconstruct
   * tracking, so the cell frees + persistence won't snapshot a dead handle. NO wood refund (destroyed,
   * not deconstructed). called every frame from step. keys via Object.keys + index loop (no Map iteration — GMRT-safe).
   */
  reapDestroyed(scene) {
    const entities = scene.level.entities;
    const builtEnts = BuildMode.of(scene.level).builtEnts;
    const keys = Object.keys(builtEnts);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const e = builtEnts[k];
      if (!entities.isValid(e.ent)) {
        delete builtEnts[k]; // already gone (removed elsewhere)
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
   * Found the player's settlement at a Survey Post: the whole level, owned by the player's faction,
   * then *spend* the post (detach its Interaction). The founded settlement is the stored state
   * (the level's own record, pooled and saved with it), so a post on an already-settled
   * level is still spent — no re-founding.
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
    scene.level.entities.detach(postId, Interaction); // spent — stop prompting / block re-founding
  },

  /**
   * world-space cursor highlight: green = placeable, yellow = deconstructable, red = invalid;
   * while a shape drag is held, the cells it would act on instead (yellow = remove, cyan =
   * capture, green = place). call from scene.draw().
   */
  drawWorld(scene, panel) {
    if (!panel.active) return;
    const cell = panel.cell;
    if (cell === undefined) return;
    const grid = scene.level.grid;
    const cw = grid.cellWidth;
    const ch = grid.cellHeight;

    const drag = panel.drag;
    if (drag !== undefined) {
      // the hovered cell clamped onto the grid, so a drag past the edge previews to the edge
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
