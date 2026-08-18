// In-engine level editor: paint tiles/entities/spawn, export to save dir, Test Play in
// sceneColony. No World — entities are spawns records (data only), not live AI.
// No zone authoring: the channels a level actually carries (settlement/climate) are built by
// ColonyMap from `meta`, which the editor round-trips whole (see _loadData) but doesn't edit.

const EDITOR_SOURCE_FILE = "levels/topdown_1.json"; // level file loaded for editing
const EDITOR_EXPORT_FILE = "topdown_export.json"; // flat name → save dir root
const EDITOR_PLAYTEST_FILE = "topdown_playtest.json"; // Test Play target (separate from export)

// "New" size presets (cols × rows); cell size inherits from the loaded level.
const EDITOR_SIZES = [
  [48, 32],
  [64, 48],
  [96, 64],
  [128, 96],
];

SceneRegistry.add(() => new _SceneEditorClass(), {
  label: I18n.textRef("EDITOR_NAME"),
  category: "SCENE_CAT_EDITOR",
});

/** standalone SCREEN class — duck-typed contract, see Scene. */
class _SceneEditorClass {
  label = "Editor";

  create(openScene) {
    // item + quest registries for the property editor; idempotent if sceneColony called it first
    contentQuests.register();

    // renderer + camera built once; _initLevel rebinds passes per level so New/Open are cheap
    this.renderer = new Renderer();
    // middle-drag pan + wheel zoom; LMB/RMB free for editing
    this.camera = new Camera().setControl(new CameraPan());
    this.camera.assign(0);

    this._tool = "wall"; // wall|floor|erase|spawn|select|entity
    this._placePreset = contentCatalog.entries[0].id; // active entity preset
    this._sizeIdx = 0; // selected "New" size preset
    this._openIdx = 0; // selected "Open" file

    this._loadData(
      LevelSerializer.load(EDITOR_SOURCE_FILE, { genre: "topdown" }),
    );

    this._buildPalette(openScene);
    this._buildPropPanel();

    Log.info(
      `level editor ready — ${this.level.grid.cols}x${this.level.grid.rows}, ` +
        `spawns=${this._spawns.length}`,
    );
  }

  /** (re)build editor state from a level-data object — shared by create() and Open */
  _loadData(data) {
    this._cell = data.cell ?? 32; // 32px-cell convention; loaded file wins
    this._initLevel(data.cols, data.rows, this._cell);
    this._loadTiles(data.tiles);

    this._spawns = (data.spawns ?? []).slice(); // copy so add/remove don't mutate the data obj
    // meta is level-scope data the editor doesn't author (entries, climate, settlements, the
    // generator seed) — held whole so export writes it back instead of dropping it
    this._meta = { ...data.meta };
    this._spawnPoint = {
      gx: data.meta.playerSpawn.gx,
      gy: data.meta.playerSpawn.gy,
    };

    this._select(undefined); // also sets _propDirty so the panel rebuilds next step
  }

  /** reload a level file (bundled source or save-dir export) into the editor */
  _openFile(path) {
    const data = LevelSerializer.load(path, { genre: "topdown" });
    if (data === null) {
      Toast.push(I18n.text("EDITOR_LOAD_FAIL", path), { type: "error" });
      return;
    }
    this._loadData(data);
    Toast.push(I18n.text("EDITOR_LOADED", path), { type: "success" });
    Log.info(
      `editor open ${path} — ${this.level.grid.cols}x${this.level.grid.rows} ` +
        `spawns=${this._spawns.length}`,
    );
  }

  /** rebuild the level at the given size; destroy the previous one first */
  _initLevel(cols, rows, cell) {
    if (this.level !== undefined) this.level.destroy(); // destroys the grid's inserted layers too
    // entity-less: the editor paints tiles and stores spawns as plain records
    this.level = new Level({
      capacity: 1,
      grid: new LevelGrid({ cellWidth: cell, cellHeight: cell, cols, rows }),
    });
    this.wallType = new TileType({
      id: 1,
      name: I18n.text("EDITOR_WALL"),
      pathCost: null,
    });
    this.floorType = new TileType({ id: 2, name: I18n.text("EDITOR_FLOOR") });
    this.floorLayer = new TileLayer(cols, rows, { emptyCost: 1 });
    this.wallLayer = new TileLayer(cols, rows);
    this.level.grid.insert(this.floorLayer);
    this.level.grid.insert(this.wallLayer);

    // rebind to the new level; reads live (no VBO) so edits show immediately
    if (this._tilePass !== undefined) this.renderer.remove(this._tilePass);
    this._tilePass = new RenderDebugTileMap(this.level.grid, {
      names: true,
      font: I18n.font("default"),
    });
    this.renderer.insert(this._tilePass);
    if (this._gridPass !== undefined) this.renderer.remove(this._gridPass);
    this._gridPass = new RenderGrid(this.level.grid);
    this.renderer.insert(this._gridPass);
  }

  /** blank level at chosen size: border wall ring, no entities, spawn at (2,2) */
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
    this._spawns = [];
    this._meta = {};
    this._extraTiles = [];
    this._spawnPoint = { gx: 2, gy: 2 };
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

  /**
   * Paint the LevelData tiles channel into the editor's two layers. The editor models only plain
   * wall/floor, so an entry naming another layer — or a wall material it can't pick — is PARKED
   * verbatim and re-emitted on export: invisible here, but never silently dropped from the file.
   * TODO: the parking goes away with the pass that puts the editor on the real contentTiles stack.
   */
  _loadTiles(tiles) {
    this._extraTiles = [];
    const list = tiles ?? [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.material === undefined && t.layer === "wall")
        this._paintRects(this.wallLayer, t.rects, this.wallType);
      else if (t.material === undefined && t.layer === "floor")
        this._paintRects(this.floorLayer, t.rects, this.floorType);
      else this._extraTiles.push(t);
    }
    if (this._extraTiles.length > 0)
      Log.info(
        `editor: parked ${this._extraTiles.length} tiles entry/entries the editor can't paint`,
      );
  }

  /** palette: bottom catbar (tools + entities) + top-left file card; both guard canvas painting */
  _buildPalette(openScene) {
    this.ui = gemsRoot();
    UI.insert(this.ui);

    this._buildCatBar();
    this._buildFileCard(openScene);
  }

  /** catbar: Tiles / Entities / Tools — sets _tool (and _placePreset for entities) */
  _buildCatBar() {
    const tiles = [
      {
        label: I18n.textRef("EDITOR_WALL"),
        onSelect: () => (this._tool = "wall"),
      },
      {
        label: I18n.textRef("EDITOR_FLOOR"),
        onSelect: () => (this._tool = "floor"),
      },
      {
        label: I18n.textRef("EDITOR_ERASE"),
        onSelect: () => (this._tool = "erase"),
      },
    ];
    const ents = [];
    for (let i = 0; i < contentCatalog.entries.length; i++) {
      const entry = contentCatalog.entries[i];
      ents.push({
        label: entry.label,
        onSelect: () => {
          this._tool = "entity";
          this._placePreset = entry.id;
        },
      });
    }
    const tools = [
      {
        label: I18n.textRef("EDITOR_SPAWN"),
        onSelect: () => (this._tool = "spawn"),
      },
      {
        label: I18n.textRef("EDITOR_SELECT"),
        onSelect: () => (this._tool = "select"),
      },
    ];

    const wrap = new UIElement({
      positionType: "absolute",
      left: 0,
      right: 0,
      bottom: 12,
      alignItems: "center",
    });
    const col = new UIElement({ width: 820, alignItems: "center" });
    const bar = gemsCatBar(
      [
        { label: I18n.textRef("EDITOR_TILES"), items: tiles },
        { label: I18n.textRef("EDITOR_ENTITIES"), items: ents },
        { label: I18n.textRef("EDITOR_TOOLS"), items: tools },
      ],
      { width: 820, itemWidth: 150 },
    );
    col.insertChild(bar);
    wrap.insertChild(col);
    this.ui.insertChild(wrap);
    this._catbar = bar; // gemsCatBar root
    this._catbarBox = col; // paint-guard rect (grows with the open flyout)
  }

  /** top-left file card: hint, tool status, New/Open pickers, Test Play / Export / Back */
  _buildFileCard(openScene) {
    const wrap = new UIElement({
      positionType: "absolute",
      left: 12,
      top: 12,
      width: 300,
    });
    const card = gemsCard({ padding: GemsTheme.pad, gap: GemsTheme.gapSm });
    // fixed-height rows for uniform spacing (gemsLabel self-sizes on 0.20)
    const labelRow = (lbl, opts, h) => {
      const row = new UIElement({ width: "100%", height: h ?? 22 });
      row.insertChild(gemsLabel(lbl, opts));
      card.insertChild(row);
    };
    labelRow(I18n.textRef("EDITOR_HINT"), { color: GemsTheme.textMuted });
    labelRow(() => this._toolStatus(), { color: GemsTheme.accent });

    // current size + blank-level new at a chosen preset
    labelRow(
      () =>
        I18n.text("EDITOR_SIZE", this.level.grid.cols, this.level.grid.rows),
      { color: GemsTheme.textMuted, font: "header" },
      26,
    );
    // UISelect renders item.name ({ name, value } shape), not a bare string
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

    // open a bundled source level or a save-dir export
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
      const e = contentCatalog.get(this._placePreset);
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
              : "EDITOR_ERASE";
    return I18n.text("EDITOR_TOOL", I18n.text(key));
  }

  update() {
    this.camera.update();

    if (this._propDirty) {
      this._rebuildProps();
      this._propDirty = false;
    }

    // skip canvas edits when cursor is over any UI panel (file card, prop panel, catbar flyout)
    const gmx = device_mouse_x_to_gui(0);
    const gmy = device_mouse_y_to_gui(0);
    if (
      this._overPanel(gmx, gmy, this._palette) ||
      this._overPanel(gmx, gmy, this._propPanel) ||
      this._overPanel(gmx, gmy, this._catbarBox)
    )
      return;

    const cell = this.level.grid.worldToGrid(mouse_x, mouse_y);

    if (
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x >= this.level.grid.cols ||
      cell.y >= this.level.grid.rows
    )
      return;

    if (this._tool === "entity") {
      // LMB places + selects; RMB deletes — edge-triggered to avoid spam
      if (mouse_check_button_pressed(mb_left)) {
        const rec = contentCatalog.get(this._placePreset).make(cell.x, cell.y);
        this._spawns.push(rec);
        this._select(rec);
      } else if (mouse_check_button_pressed(mb_right)) {
        this._deleteSpawnAt(cell.x, cell.y);
      }
    } else if (this._tool === "select") {
      if (mouse_check_button_pressed(mb_left)) this._selectAt(cell.x, cell.y);
    } else if (this._tool === "spawn") {
      if (mouse_check_button_pressed(mb_left))
        this._spawnPoint = { gx: cell.x, gy: cell.y };
    } else if (mouse_check_button(mb_left)) {
      if (this._tool === "wall")
        TileEdit.set(this.wallLayer, cell.x, cell.y, this.wallType);
      else if (this._tool === "floor")
        TileEdit.set(this.floorLayer, cell.x, cell.y, this.floorType);
      else this._eraseBoth(cell.x, cell.y);
    } else if (mouse_check_button(mb_right)) {
      this._eraseBoth(cell.x, cell.y); // quick erase both layers
    }

    Tooltip.set(`(${cell.x}, ${cell.y})`);
  }

  _eraseBoth(gx, gy) {
    TileEdit.clear(this.wallLayer, gx, gy);
    TileEdit.clear(this.floorLayer, gx, gy);
  }

  /** true if GUI cursor overlaps the panel's rect (width > 0 guards the first-frame NaN rect) */
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

  /** remove last spawn at cell; clears selection if it was the deleted one */
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
    this._selected = rec; // undefined = deselect
    this._propDirty = true;
  }

  /** select topmost spawn at cell (deselects when empty) */
  _selectAt(gx, gy) {
    let found;
    for (let i = this._spawns.length - 1; i >= 0; i--)
      if (this._spawns[i].gx === gx && this._spawns[i].gy === gy) {
        found = this._spawns[i];
        break;
      }
    this._select(found);
  }

  /** property panel (right): header + body rebuilt from selected spawn's catalog fields */
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
        font: "header",
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

  /**
   * repopulate the prop body from the selected spawn; scalar edits are in-place, list changes set _propDirty
   */
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
    const entry = contentCatalog.get(rec.preset);
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

  /** one field row: stepper for int, picker for select/quest — edits record in place */
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
    // quest options sourced live from QuestLog registry
    let opts;
    if (f.kind === "quest") {
      opts = [{ name: "(none)", value: undefined }];
      const quests = QuestLog.all();
      for (let i = 0; i < quests.length; i++)
        opts.push({ name: quests[i].id, value: quests[i].id });
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

  /** inventory/loot list field: add/remove rows rebuild the panel; per-row edits mutate in place */
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

  /** { itemId, qty } row: item picker + qty stepper + remove button */
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

  /**
   * Assemble the level FILE: a LevelData (tile layers greedy-meshed back into rects) plus the
   * level-scope keys. `meta` is the loaded one with the edited player spawn written over it, so a
   * level's entries/climate/settlements survive a round trip through the editor.
   */
  _buildData() {
    const tiles = [];
    const walls = TileEdit.meshRects(this.level.grid, this.wallLayer);
    if (walls.length > 0) tiles.push({ layer: "wall", rects: walls });
    const floors = TileEdit.meshRects(this.level.grid, this.floorLayer);
    if (floors.length > 0) tiles.push({ layer: "floor", rects: floors });
    for (let i = 0; i < this._extraTiles.length; i++)
      tiles.push(this._extraTiles[i]); // see _loadTiles
    const data = {
      version: 1,
      genre: "topdown",
      cell: this.level.grid.cellWidth,
      cols: this.level.grid.cols,
      rows: this.level.grid.rows,
      meta: {
        ...this._meta,
        playerSpawn: { gx: this._spawnPoint.gx, gy: this._spawnPoint.gy },
      },
      tiles: tiles,
      spawns: this._spawns,
    };
    return data;
  }

  /** write to save dir; copy into datafiles/levels/ to ship */
  _export() {
    const data = this._buildData();
    const ok = LevelSerializer.save(EDITOR_EXPORT_FILE, data);
    Toast.push(I18n.text("EDITOR_SAVED", EDITOR_EXPORT_FILE), {
      type: ok ? "success" : "error",
    });
    let rects = 0;
    for (let i = 0; i < data.tiles.length; i++)
      rects += data.tiles[i].rects.length;
    Log.info(
      `editor export ${ok ? "ok" : "FAILED"} → ${EDITOR_EXPORT_FILE} ` +
        `${data.cols}x${data.rows} tiles=${data.tiles.length} channel(s)/${rects} rect(s) ` +
        `spawns=${data.spawns.length} ` +
        `spawn=(${data.meta.playerSpawn.gx},${data.meta.playerSpawn.gy})`,
    );
  }

  /** serialize to playtest file, open sceneColony; returning goes to lobby, not back to editor */
  _play(openScene) {
    LevelSerializer.save(EDITOR_PLAYTEST_FILE, this._buildData());
    ColonyLevel.playtestFile = EDITOR_PLAYTEST_FILE;
    Log.info(`editor play → ${EDITOR_PLAYTEST_FILE}`);
    openScene(SceneColony);
  }

  draw() {
    this.renderer.draw(); // grid + walls + tile labels
    this._drawFloors(); // translucent fill for painted floors
    this._drawMarkers(); // entity spawn records
    this._drawSpawn(); // player spawn marker
  }

  _drawFloors() {
    const cw = this.level.grid.cellWidth;
    const ch = this.level.grid.cellHeight;
    draw_set_color(make_colour_rgb(80, 150, 200));
    draw_set_alpha(0.2);
    for (let y = 0; y < this.level.grid.rows; y++)
      for (let x = 0; x < this.level.grid.cols; x++)
        if (TileEdit.occupied(this.floorLayer, x, y))
          draw_rectangle(x * cw, y * ch, x * cw + cw, y * ch + ch, false);
    draw_set_alpha(1);
    draw_set_color(c_white);
  }

  _drawMarkers() {
    const cw = this.level.grid.cellWidth;
    const ch = this.level.grid.cellHeight;
    draw_set_halign(fa_center);
    for (let i = 0; i < this._spawns.length; i++) {
      const s = this._spawns[i];
      const e = contentCatalog.get(s.preset);
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

  _drawSpawn() {
    const cw = this.level.grid.cellWidth;
    const ch = this.level.grid.cellHeight;
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
    teardownScene(this); // frees the level (grid + inserted layers), renderer, camera, ui
  }
}
