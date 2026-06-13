// In-engine level editor (tiles + floors + entity placement + player spawn + new/resize +
// import/export).
//
// A dedicated authoring Scene — NOT a simulation. It loads a level file (or starts a fresh
// blank one), holds the level data, renders a grid representation with a pan/zoom camera,
// and lets you paint wall/floor tiles, place/delete entities, and set the player spawn,
// then exports the edited level back to a JSON file. No World, no physics, no gameplay
// systems: everything placed is pure data (entities are `spawns` records drawn as markers,
// not live AI entities). Modeled on sceneTileTerrain.
//
// Grid size is independent of the room — a level can be far larger than the view, and the
// pan/zoom camera roams it. The "New WxH" control rebuilds the canvas blank at the chosen
// size (with a border wall ring) so you can author bigger maps from scratch.
//
// Tools (a flat "categorized" palette, no tab show/hide): the Tiles section selects a
// wall/floor/erase brush (LMB drag-paints, RMB erases both layers), the Spawn tool (LMB
// sets the player spawn cell), the Select tool (LMB picks an entity to edit in the right
// property panel), or the Zone tool (LMB click-drag paints a buildable-zone rectangle, RMB
// erases it); the Entities section selects a RpgCatalog preset (LMB places one at the
// cell and selects it, RMB deletes the one there).
//
// Export writes via File.write → buffer_save, which targets the SAVE dir
// (%LOCALAPPDATA%/gems/), not the read-only bundled datafiles/. To ship an exported
// level, copy it into datafiles/levels/ and register it in IncludedFiles. Open re-imports
// a level file (the bundled source or the save-dir export) — the round-trip's other half,
// and the only path that reads exported zoneMaps back in. Test Play serializes the level to
// a playtest file and opens sceneRpg on it (via RpgLevel.playtestFile) so you can
// play what you authored without the copy-to-datafiles step; returning lands in the lobby.

const EDITOR_SOURCE_FILE = "levels/topdown_1.json"; // level loaded for editing
const EDITOR_EXPORT_FILE = "topdown_export.json"; // flat name → save dir root
const EDITOR_PLAYTEST_FILE = "topdown_playtest.json"; // Test Play target (separate from export)

// Blank-level size presets for the "New" control (cols × rows). The cell size carries over
// from the currently loaded level.
const EDITOR_SIZES = [
  [48, 32],
  [64, 48],
  [96, 64],
  [128, 96],
];

SceneRegistry.add(() => new _SceneEditorClass(), {
  label: I18n.textRef("EDITOR_NAME"),
  category: "SCENE_CAT_MAP",
});

class _SceneEditorClass extends Scene {
  label = "Editor";

  create(openScene) {
    // Item + quest registries back the property editor's item picker + quest select.
    // Idempotent; the play scene calls it too — this just makes the data available here.
    RpgQuests.register();

    // Renderer + camera are built once; _initLevel (re)binds the tilemap + zone passes to
    // whatever level is current, so New/resize/Open don't rebuild the camera or the palette.
    this.renderer = new Renderer();
    this.camera = cameraPan(); // middle-drag pan + wheel zoom; LMB/RMB free for editing
    this.camera.assign(0);

    this._tool = "wall"; // wall|floor|erase|spawn|select|zone|entity
    this._placePreset = RpgCatalog.entries[0].id; // active entity preset
    this._sizeIdx = 0; // selected "New" size preset
    this._openIdx = 0; // selected "Open" file

    this._loadData(
      LevelSerializer.load(EDITOR_SOURCE_FILE, { genre: "topdown" }),
    );

    this._buildPalette(openScene);
    this._buildPropPanel();

    Log.info(
      `level editor ready — ${this.level.cols}x${this.level.rows}, ` +
        `spawns=${this._spawns.length}`,
    );
  }

  // The single load path: (re)build all editor state from a level-data object. Shared by
  // create() (the bundled source) and Open (a chosen file). Mirrors RpgLevel.build's
  // bulk rect paint, plus the editable spawns / player spawn and any saved buildable zone.
  _loadData(data) {
    this._cell = data.cell ?? 32;
    this._initLevel(data.cols, data.rows, this._cell);
    this._paintRects(this.wallLayer, data.walls, this.wallType);
    this._paintRects(this.floorLayer, data.floors, this.floorType);
    this.level.syncAll();

    this._spawns = (data.spawns ?? []).slice(); // add/remove entries (no field mutation)
    this._spawnPoint = {
      gx: data.meta.playerSpawn.gx,
      gy: data.meta.playerSpawn.gy,
    };

    // Restore a saved buildable zone when the file carries one (the editor exports it; the
    // play scene doesn't read it back yet). import() replaces the map _initLevel just
    // defined, so re-point _zoneId at the imported buildable zone for the Zone tool.
    if (data.zoneMaps !== undefined && data.zoneMaps.buildable !== undefined) {
      const map = this.level.zoneMap("buildable");
      map.import(data.zoneMaps.buildable);
      const z = map.byTag("buildable")[0];
      if (z !== undefined) this._zoneId = z.id;
    }

    this._zoneDrag = undefined;
    this._select(undefined); // also sets _propDirty so the panel rebuilds next step
  }

  // Open (re-import) a level file, replacing the editor's current level. Reading the bundled
  // source ("levels/…") and the save-dir export (flat name) both go through File.read.
  _openFile(path) {
    const data = LevelSerializer.load(path, { genre: "topdown" });
    if (data === null) {
      Toast.push(I18n.text("EDITOR_LOAD_FAIL", path), { type: "error" });
      return;
    }
    this._loadData(data);
    Toast.push(I18n.text("EDITOR_LOADED", path), { type: "success" });
    Log.info(
      `editor open ${path} — ${this.level.cols}x${this.level.rows} ` +
        `spawns=${this._spawns.length}`,
    );
  }

  // (Re)build the level grid + tile layers at a given size and rebind the render pass to
  // it. Destroys any previous level (and its inserted layers) first. Called from create()
  // and from _newBlank() — the only place a fresh Level is constructed.
  _initLevel(cols, rows, cell) {
    if (this.level !== undefined) this.level.destroy(); // also destroys inserted layers
    this.level = new Level({ cellWidth: cell, cellHeight: cell, cols, rows });
    this.wallType = new TileType({ id: 1, name: "벽", pathCost: null });
    this.floorType = new TileType({ id: 2, name: "바닥" });
    this.floorLayer = new TileLayer(cols, rows, { emptyCost: 1 });
    this.wallLayer = new TileLayer(cols, rows);
    this.level.insert(this.floorLayer);
    this.level.insert(this.wallLayer);

    // RenderDebugTileMap holds a level ref, so rebind it to the new level. It reads the
    // level live each frame (no VBO), so edits show at once; it shades walls red (cost ∞)
    // but not floors (cost 1) — the editor fills floor cells itself in draw().
    if (this._tilePass !== undefined) this.renderer.remove(this._tilePass);
    this._tilePass = new RenderDebugTileMap(this.level, {
      names: true,
      font: I18n.font("default"),
    });
    this.renderer.insert(this._tilePass);
    if (this._gridPass !== undefined) this.renderer.remove(this._gridPass);
    this._gridPass = new RenderGrid(this.level); // cell boundary lines
    this.renderer.insert(this._gridPass);

    // Buildable zone channel — one zone the Zone tool drag-paints; RenderZone tints +
    // outlines it over the grid (under the entity markers drawn in draw()). Rebound per
    // level like the tile pass.
    const zmap = this.level.addZoneMap("buildable");
    this._zoneId = zmap.define({
      name: I18n.text("BUILD_ZONE"),
      tags: ["buildable"],
      data: { color: "#55aa55" },
    }).id;
    if (this._zonePass !== undefined) this.renderer.remove(this._zonePass);
    this._zonePass = new RenderZone(this.level, "buildable", { alpha: 0.28 });
    this.renderer.insert(this._zonePass);
    if (this._zoneLabelPass !== undefined)
      this.renderer.remove(this._zoneLabelPass);
    this._zoneLabelPass = new RenderZoneLabel(this.level, "buildable", {
      font: I18n.font("default"),
    });
    this.renderer.insert(this._zoneLabelPass);
  }

  // Start a fresh blank level at the chosen size: enclosed by a border wall ring (bounded +
  // immediately playable), no entities, spawn reset just inside the corner.
  _newBlank(cols, rows) {
    this._initLevel(cols, rows, this._cell);
    for (let x = 0; x < cols; x++) {
      this.wallLayer.set(x, 0, this.wallType);
      this.wallLayer.set(x, rows - 1, this.wallType);
    }
    for (let y = 0; y < rows; y++) {
      this.wallLayer.set(0, y, this.wallType);
      this.wallLayer.set(cols - 1, y, this.wallType);
    }
    this.level.syncAll();
    this._spawns = [];
    this._spawnPoint = { gx: 2, gy: 2 };
    this._zoneDrag = undefined; // the zone map is freshly recreated by _initLevel
    this._select(undefined);
    Toast.push(I18n.text("EDITOR_SIZE", cols, rows), { type: "info" });
  }

  _paintRects(layer, rects, type) {
    const list = rects ?? [];
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      for (let y = r[1]; y < r[1] + r[3]; y++)
        for (let x = r[0]; x < r[0] + r[2]; x++) layer.set(x, y, type);
    }
  }

  // Categorized palette card, anchored top-left. Its rect is the paint-guard hit test.
  _buildPalette(openScene) {
    this.ui = gemsRoot();
    UI.insert(this.ui);
    const wrap = new UIElement({
      positionType: "absolute",
      left: 12,
      top: 12,
      width: 300,
    });
    const card = gemsCard({ padding: GemsTheme.pad, gap: GemsTheme.gapSm });
    // gemsLabel makes a bare (height-less) node; in a flex column it collapses and
    // overlaps its siblings, so wrap each label in a fixed-height row (as sceneRpg
    // does for its HUD labels).
    const labelRow = (lbl, opts, h) => {
      const row = new UIElement({ width: "100%", height: h ?? 22 });
      row.insertChild(gemsLabel(lbl, opts));
      card.insertChild(row);
    };
    labelRow(I18n.textRef("EDITOR_HINT"), { color: GemsTheme.textMuted });
    labelRow(() => this._toolStatus(), { color: GemsTheme.accent });

    // Tiles section — wall/floor/erase brushes + the Spawn tool (all single-cell tools).
    labelRow(
      I18n.textRef("EDITOR_TILES"),
      { color: GemsTheme.textMuted, font: I18n.font("header") },
      26,
    );
    const tool = (key, name) =>
      card.insertChild(
        gemsButton(I18n.textRef(key), () => {
          this._tool = name;
        }),
      );
    tool("EDITOR_WALL", "wall");
    tool("EDITOR_FLOOR", "floor");
    tool("EDITOR_ERASE", "erase");
    tool("EDITOR_SPAWN", "spawn");
    tool("EDITOR_SELECT", "select");
    tool("EDITOR_ZONE", "zone");

    // Entities section — one button per catalog preset.
    labelRow(
      I18n.textRef("EDITOR_ENTITIES"),
      { color: GemsTheme.textMuted, font: I18n.font("header") },
      26,
    );
    for (let i = 0; i < RpgCatalog.entries.length; i++) {
      const entry = RpgCatalog.entries[i];
      card.insertChild(
        gemsButton(entry.label, () => {
          this._tool = "entity";
          this._placePreset = entry.id;
        }),
      );
    }

    // Level section — current size + create a fresh blank level at a chosen preset size.
    labelRow(
      () => I18n.text("EDITOR_SIZE", this.level.cols, this.level.rows),
      { color: GemsTheme.textMuted, font: I18n.font("header") },
      26,
    );
    // UISelect renders item.name (a { name, value } shape), not a bare string.
    const sizeItems = [];
    for (let i = 0; i < EDITOR_SIZES.length; i++)
      sizeItems.push({
        name: EDITOR_SIZES[i][0] + "x" + EDITOR_SIZES[i][1],
        value: i,
      });
    card.insertChild(
      gemsSelectCustom(sizeItems, this._sizeIdx, (i) => {
        this._sizeIdx = i;
      }),
    );
    card.insertChild(
      gemsButton(
        () => {
          const s = EDITOR_SIZES[this._sizeIdx];
          return I18n.text("EDITOR_NEW", s[0], s[1]);
        },
        () => {
          const s = EDITOR_SIZES[this._sizeIdx];
          this._newBlank(s[0], s[1]);
        },
      ),
    );

    // Open: re-import a level file (the bundled source or the save-dir export) — the other
    // half of the round-trip, and the only path that reads exported zoneMaps back.
    const openItems = [
      { name: "topdown_1", value: EDITOR_SOURCE_FILE },
      { name: "export", value: EDITOR_EXPORT_FILE },
    ];
    card.insertChild(
      gemsSelectCustom(openItems, this._openIdx, (i) => {
        this._openIdx = i;
      }),
    );
    card.insertChild(
      gemsButton(I18n.textRef("EDITOR_OPEN"), () =>
        this._openFile(openItems[this._openIdx].value),
      ),
    );

    card.insertChild(
      gemsButton(I18n.textRef("EDITOR_PLAY"), () => this._play(openScene), {
        primary: true,
      }),
    );
    card.insertChild(
      gemsButton(I18n.textRef("EDITOR_EXPORT"), () => this._export()),
    );
    card.insertChild(
      gemsButton(I18n.textRef("EDITOR_BACK"), () => openScene(SCENES.lobby)),
    );
    wrap.insertChild(card);
    this.ui.insertChild(wrap);
    this._palette = wrap;
  }

  _toolStatus() {
    if (this._tool === "entity") {
      const e = RpgCatalog.get(this._placePreset);
      return I18n.text("EDITOR_TOOL", e ? e.label : this._placePreset);
    }
    const key =
      this._tool === "wall"
        ? "EDITOR_WALL"
        : this._tool === "floor"
          ? "EDITOR_FLOOR"
          : this._tool === "spawn"
            ? "EDITOR_SPAWN"
            : this._tool === "select"
              ? "EDITOR_SELECT"
              : this._tool === "zone"
                ? "EDITOR_ZONE"
                : "EDITOR_ERASE";
    return I18n.text("EDITOR_TOOL", I18n.text(key));
  }

  step() {
    this.camera.update();

    // Rebuild the property panel body when the selection or an edited list changed.
    if (this._propDirty) {
      this._rebuildProps();
      this._propDirty = false;
    }

    // Commit an in-progress zone drag on the release edge — checked before the panel guard
    // so releasing the mouse over a panel still finalizes (never leaves a drag stuck). The
    // start/preview-tracking is canvas-only (below); only the release is global.
    if (this._tool === "zone" && this._zoneDrag !== undefined) {
      const btn = this._zoneDrag.erase ? mb_right : mb_left;
      if (mouse_check_button_released(btn)) this._commitZone();
    }

    // Paint guard: skip when the cursor is over either UI panel (GUI space) so clicking a
    // widget doesn't also edit the canvas behind it.
    const gmx = device_mouse_x_to_gui(0);
    const gmy = device_mouse_y_to_gui(0);
    if (
      this._overPanel(gmx, gmy, this._palette) ||
      this._overPanel(gmx, gmy, this._propPanel)
    )
      return;

    const cell = this.level.worldToGrid(mouse_x, mouse_y);

    // Zone: a click-drag rectangle (LMB paints, RMB erases). Start + live preview track
    // here (clamped to the grid); the release commits via the global check above.
    if (this._tool === "zone") {
      this._zoneTrack(cell);
      return;
    }

    if (
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x >= this.level.cols ||
      cell.y >= this.level.rows
    )
      return;

    if (this._tool === "entity") {
      // Entities: place on LMB click (and select it for editing), delete the one at the
      // cell on RMB click (edge-triggered — held would spam-place/delete).
      if (mouse_check_button_pressed(mb_left)) {
        const rec = RpgCatalog.get(this._placePreset).make(cell.x, cell.y);
        this._spawns.push(rec);
        this._select(rec);
      } else if (mouse_check_button_pressed(mb_right)) {
        this._deleteSpawnAt(cell.x, cell.y);
      }
    } else if (this._tool === "select") {
      // Select: LMB picks the topmost entity at the cell to edit (empty cell = deselect).
      if (mouse_check_button_pressed(mb_left)) this._selectAt(cell.x, cell.y);
    } else if (this._tool === "spawn") {
      // Spawn: LMB click sets the player spawn cell (edge-triggered).
      if (mouse_check_button_pressed(mb_left))
        this._spawnPoint = { gx: cell.x, gy: cell.y };
    } else if (mouse_check_button(mb_left)) {
      // Tile tools: LMB drag-paints the active brush.
      if (this._tool === "wall")
        TileEdit.set(this.level, this.wallLayer, cell.x, cell.y, this.wallType);
      else if (this._tool === "floor")
        TileEdit.set(
          this.level,
          this.floorLayer,
          cell.x,
          cell.y,
          this.floorType,
        );
      else this._eraseBoth(cell.x, cell.y);
    } else if (mouse_check_button(mb_right)) {
      this._eraseBoth(cell.x, cell.y); // RMB = quick erase (both layers)
    }

    Tooltip.set(`(${cell.x}, ${cell.y})`);
  }

  _eraseBoth(gx, gy) {
    TileEdit.clear(this.level, this.wallLayer, gx, gy);
    TileEdit.clear(this.level, this.floorLayer, gx, gy);
  }

  // Zone tool: record the drag start on the press edge and track the current cell (both
  // clamped to the grid so a drag that strays off-grid still rectangles to the edge).
  _zoneTrack(cell) {
    const gx = clamp(cell.x, 0, this.level.cols - 1);
    const gy = clamp(cell.y, 0, this.level.rows - 1);
    this._zoneCur = { x: gx, y: gy };
    if (this._zoneDrag === undefined) {
      if (mouse_check_button_pressed(mb_left))
        this._zoneDrag = { sx: gx, sy: gy, erase: false };
      else if (mouse_check_button_pressed(mb_right))
        this._zoneDrag = { sx: gx, sy: gy, erase: true };
    }
  }

  // Finalize the drag rectangle into the zone map (paint or erase), then clear the drag.
  _commitZone() {
    const d = this._zoneDrag;
    const cur = this._zoneCur ?? { x: d.sx, y: d.sy };
    const x1 = d.sx < cur.x ? d.sx : cur.x;
    const y1 = d.sy < cur.y ? d.sy : cur.y;
    const x2 = d.sx > cur.x ? d.sx : cur.x;
    const y2 = d.sy > cur.y ? d.sy : cur.y;
    const map = this.level.zoneMap("buildable");
    if (d.erase) map.eraseRect(x1, y1, x2, y2);
    else map.paintRect(this._zoneId, x1, y1, x2, y2);
    this._zoneDrag = undefined;
    this._zoneCur = undefined;
  }

  // True when the GUI-space cursor is over a panel's laid-out rect (`width > 0` dodges the
  // first-frame NaN rect).
  _overPanel(gmx, gmy, panel) {
    const p = panel.getLayoutPosition();
    return (
      p.width > 0 &&
      gmx >= p.x &&
      gmx <= p.x + p.width &&
      gmy >= p.y &&
      gmy <= p.y + p.height
    );
  }

  // Remove the last-placed spawn occupying (gx, gy), if any (clearing the selection if it
  // was the deleted one).
  _deleteSpawnAt(gx, gy) {
    for (let i = this._spawns.length - 1; i >= 0; i--) {
      if (this._spawns[i].gx === gx && this._spawns[i].gy === gy) {
        if (this._spawns[i] === this._selected) this._select(undefined);
        this._spawns.splice(i, 1);
        return;
      }
    }
  }

  _select(rec) {
    this._selected = rec; // may be undefined (deselect)
    this._propDirty = true;
  }

  // Select the topmost spawn at a cell (undefined when the cell is empty).
  _selectAt(gx, gy) {
    let found;
    for (let i = this._spawns.length - 1; i >= 0; i--)
      if (this._spawns[i].gx === gx && this._spawns[i].gy === gy) {
        found = this._spawns[i];
        break;
      }
    this._select(found);
  }

  // ── Property panel (right) ───────────────────────────────────────────────
  // Header + a body rebuilt (on _propDirty) from the selected spawn's catalog `fields`
  // schema. Its rect also guards painting (handled in step()).
  _buildPropPanel() {
    const wrap = new UIElement({
      positionType: "absolute",
      top: 12,
      right: 12,
      width: 320,
    });
    const card = gemsCard({ padding: GemsTheme.pad, gap: GemsTheme.gapSm });
    const title = new UIElement({ width: "100%", height: 26 });
    title.insertChild(
      gemsLabel(I18n.textRef("EDITOR_PROPS"), {
        color: GemsTheme.textMuted,
        font: I18n.font("header"),
      }),
    );
    card.insertChild(title);
    const body = new UIElement({ width: "100%", gap: GemsTheme.gapSm });
    card.insertChild(body);
    wrap.insertChild(card);
    this.ui.insertChild(wrap);
    this._propPanel = wrap;
    this._propBody = body;
  }

  // Repopulate the property body from the selected spawn (clear children + re-add rows —
  // the RpgInventoryUI.rebuild pattern; child-tree edits are GMRT-safe, style mutation is
  // not). Scalar fields edit the record in place (no rebuild); list add/remove sets
  // _propDirty.
  _rebuildProps() {
    const body = this._propBody;
    const kids = [...body.children];
    for (let i = 0; i < kids.length; i++) kids[i].destroy();

    if (this._selected === undefined) {
      const r = new UIElement({ width: "100%", height: 24 });
      r.insertChild(
        gemsLabel(I18n.textRef("EDITOR_NO_SEL"), { color: GemsTheme.textDim }),
      );
      body.insertChild(r);
      return;
    }

    const rec = this._selected;
    const entry = RpgCatalog.get(rec.preset);
    const head = new UIElement({ width: "100%", height: 22 });
    head.insertChild(
      gemsLabel(
        () =>
          (entry !== undefined ? entry.label : rec.preset) +
          "  (" +
          rec.gx +
          ", " +
          rec.gy +
          ")",
        { color: GemsTheme.accent },
      ),
    );
    body.insertChild(head);

    const fields =
      entry !== undefined && entry.fields !== undefined ? entry.fields : [];
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f.kind === "items") this._itemListField(rec, f, body);
      else body.insertChild(this._fieldRow(rec, f));
    }
  }

  // One scalar field row: a stepper for int, a { name, value } picker for select/quest.
  // Edits the record in place — the widget shows the new value, so no panel rebuild.
  _fieldRow(rec, f) {
    if (f.kind === "int") {
      return gemsRow(
        f.label,
        gemsStepper(
          rec[f.key] ?? f.min ?? 0,
          (v) => {
            rec[f.key] = v;
          },
          { min: f.min ?? 0, max: f.max ?? 99, step: f.step ?? 1 },
        ),
      );
    }
    // select / quest — quest sources its options live from the QuestLog registry.
    let opts;
    if (f.kind === "quest") {
      opts = [{ name: "(none)", value: undefined }];
      for (let i = 0; i < QuestLog.defOrder.length; i++)
        opts.push({ name: QuestLog.defOrder[i], value: QuestLog.defOrder[i] });
    } else {
      opts = f.options;
    }
    let idx = 0;
    for (let i = 0; i < opts.length; i++)
      if (opts[i].value === rec[f.key]) idx = i;
    return gemsRow(
      f.label,
      gemsSelectCustom(opts, idx, (_i, value) => {
        rec[f.key] = value;
      }),
    );
  }

  // An inventory/loot list field: a labeled add/remove list of { itemId, qty } rows.
  // Length changes (add/remove) rebuild the panel; per-row edits mutate in place.
  _itemListField(rec, f, body) {
    const arr = rec[f.key];
    const title = new UIElement({ width: "100%", height: 22 });
    title.insertChild(gemsLabel(f.label, { color: GemsTheme.textMuted }));
    body.insertChild(title);

    const items = Item.all();
    const itemOpts = [];
    for (let i = 0; i < items.length; i++)
      itemOpts.push({ name: items[i].id, value: items[i].id });

    for (let i = 0; i < arr.length; i++)
      body.insertChild(this._itemEntryRow(arr, i, itemOpts));

    body.insertChild(
      gemsButton(
        "+ " + f.label,
        () => {
          arr.push({
            itemId: itemOpts.length > 0 ? itemOpts[0].value : "",
            qty: 1,
          });
          this._propDirty = true;
        },
        { height: 28 },
      ),
    );
  }

  // One { itemId, qty } row: item picker (grows) + qty stepper + remove button.
  _itemEntryRow(arr, i, itemOpts) {
    const e = arr[i];
    const row = new UIElement({
      width: "100%",
      height: 36,
      flexDirection: "row",
      alignItems: "center",
      gap: GemsTheme.gapSm,
    });
    let idx = 0;
    for (let k = 0; k < itemOpts.length; k++)
      if (itemOpts[k].value === e.itemId) idx = k;
    const selCell = new UIElement({ flexGrow: 1, flexBasis: 0 });
    selCell.insertChild(
      gemsSelectCustom(itemOpts, idx, (_j, value) => {
        e.itemId = value;
      }),
    );
    row.insertChild(selCell);
    const qtyCell = new UIElement({ width: 92, flexShrink: 0 });
    qtyCell.insertChild(
      gemsStepper(
        e.qty,
        (v) => {
          e.qty = v;
        },
        { min: 1, max: 99 },
      ),
    );
    row.insertChild(qtyCell);
    const rmCell = new UIElement({ width: 34, flexShrink: 0 });
    rmCell.insertChild(
      gemsButton(
        "x",
        () => {
          arr.splice(i, 1);
          this._propDirty = true;
        },
        { height: 36 },
      ),
    );
    row.insertChild(rmCell);
    return row;
  }

  // Assemble the edited level into a data object (the export + playtest payload). Walls/
  // floors are re-derived from the painted grids via the greedy mesh; meta carries the
  // player spawn; the buildable zone is emitted only when it has cells (matches
  // Level.export, read back via ZoneMap.import; skipped empty to keep files lean).
  _buildData() {
    const data = {
      version: 1,
      genre: "topdown",
      cell: this.level.cellWidth,
      cols: this.level.cols,
      rows: this.level.rows,
      meta: {
        playerSpawn: { gx: this._spawnPoint.gx, gy: this._spawnPoint.gy },
      },
      walls: TileEdit.meshRects(this.level, this.wallLayer),
      floors: TileEdit.meshRects(this.level, this.floorLayer),
      layers: [],
      spawns: this._spawns,
    };
    const zmap = this.level.zoneMap("buildable");
    if (zmap !== undefined && zmap.cells(this._zoneId).length > 0)
      data.zoneMaps = { buildable: zmap.export() };
    return data;
  }

  // Write the level to the export file (save dir). To ship it, copy into datafiles/levels/.
  _export() {
    const data = this._buildData();
    const ok = LevelSerializer.save(EDITOR_EXPORT_FILE, data);
    Toast.push(I18n.text("EDITOR_SAVED", EDITOR_EXPORT_FILE), {
      type: ok ? "success" : "error",
    });
    Log.info(
      `editor export ${ok ? "ok" : "FAILED"} → ${EDITOR_EXPORT_FILE} ` +
        `${data.cols}x${data.rows} walls=${data.walls.length} ` +
        `floors=${data.floors.length} spawns=${data.spawns.length} ` +
        `spawn=(${data.meta.playerSpawn.gx},${data.meta.playerSpawn.gy})`,
    );
  }

  // Test Play: serialize the current level to the playtest file, hand the path to
  // sceneRpg (consume-once side-channel), and open it. Returning goes to the lobby, not
  // back to the editor; the export persists, so reopen it via Open to keep editing.
  _play(openScene) {
    LevelSerializer.save(EDITOR_PLAYTEST_FILE, this._buildData());
    RpgLevel.playtestFile = EDITOR_PLAYTEST_FILE;
    Log.info(`editor play → ${EDITOR_PLAYTEST_FILE}`);
    openScene(SceneRpg);
  }

  draw() {
    this.renderer.draw(); // grid + walls (red) + tile labels, under the pan/zoom camera
    this._drawFloors(); // translucent fill so painted floors are visible
    this._drawMarkers(); // entity spawn records as colored boxes + labels
    this._drawSpawn(); // player spawn marker
    this._drawZonePreview(); // in-progress zone drag rectangle
  }

  // The live zone drag rectangle (green paint / red erase), from drag start to the current
  // cell. The committed zone itself is drawn by the RenderZone pass in renderer.draw().
  _drawZonePreview() {
    if (this._zoneDrag === undefined || this._zoneCur === undefined) return;
    const cw = this.level.cellWidth;
    const ch = this.level.cellHeight;
    const d = this._zoneDrag;
    const c = this._zoneCur;
    const x1 = (d.sx < c.x ? d.sx : c.x) * cw;
    const y1 = (d.sy < c.y ? d.sy : c.y) * ch;
    const x2 = ((d.sx > c.x ? d.sx : c.x) + 1) * cw;
    const y2 = ((d.sy > c.y ? d.sy : c.y) + 1) * ch;
    draw_set_color(
      d.erase ? make_colour_rgb(220, 90, 80) : make_colour_rgb(90, 200, 110),
    );
    draw_set_alpha(0.25);
    draw_rectangle(x1, y1, x2, y2, false);
    draw_set_alpha(1);
    draw_rectangle(x1, y1, x2, y2, true);
    draw_set_color(c_white);
  }

  _drawFloors() {
    const cw = this.level.cellWidth;
    const ch = this.level.cellHeight;
    draw_set_color(make_colour_rgb(80, 150, 200));
    draw_set_alpha(0.2);
    for (let y = 0; y < this.level.rows; y++)
      for (let x = 0; x < this.level.cols; x++)
        if (TileEdit.occupied(this.floorLayer, x, y))
          draw_rectangle(x * cw, y * ch, x * cw + cw, y * ch + ch, false);
    draw_set_alpha(1);
    draw_set_color(c_white);
  }

  _drawMarkers() {
    const cw = this.level.cellWidth;
    const ch = this.level.cellHeight;
    draw_set_halign(fa_center);
    for (let i = 0; i < this._spawns.length; i++) {
      const s = this._spawns[i];
      const e = RpgCatalog.get(s.preset);
      const wx = s.gx * cw;
      const wy = s.gy * ch;
      draw_set_color(e !== undefined ? Color.parse(e.color) : c_white);
      draw_set_alpha(0.85);
      draw_rectangle(wx + 5, wy + 5, wx + cw - 5, wy + ch - 5, false);
      draw_set_alpha(1);
      draw_set_color(c_white);
      draw_text(wx + cw * 0.5, wy - 4, e !== undefined ? e.label : s.preset);
    }
    draw_set_halign(fa_left);
    draw_set_color(c_white);
  }

  // Player spawn cell: a filled green disc + label, distinct from the entity boxes.
  _drawSpawn() {
    const cw = this.level.cellWidth;
    const ch = this.level.cellHeight;
    const cx = this._spawnPoint.gx * cw + cw * 0.5;
    const cy = this._spawnPoint.gy * ch + ch * 0.5;
    const rad = (cw < ch ? cw : ch) * 0.38;
    draw_set_color(make_colour_rgb(70, 230, 120));
    draw_set_alpha(0.9);
    draw_circle(cx, cy, rad, false);
    draw_set_alpha(1);
    draw_set_color(c_white);
    draw_set_halign(fa_center);
    draw_text(cx, cy - ch * 0.7, I18n.text("EDITOR_SPAWN"));
    draw_set_halign(fa_left);
    draw_set_color(c_white);
  }

  destroy() {
    this.level.destroy(); // also destroys its inserted wall/floor layers
    teardownScene(this);
  }
}
