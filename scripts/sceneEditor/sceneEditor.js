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
// wall/floor/erase brush (LMB drag-paints, RMB erases both layers) or the Spawn tool (LMB
// sets the player spawn cell); the Entities section selects a TopDownCatalog preset (LMB
// places one at the cell, RMB deletes the one there).
//
// Export writes via File.write → buffer_save, which targets the SAVE dir
// (%LOCALAPPDATA%/gems/), not the read-only bundled datafiles/. To ship an exported
// level, copy it into datafiles/levels/ and register it in IncludedFiles.

const EDITOR_SOURCE_FILE = "levels/topdown_1.json"; // level loaded for editing
const EDITOR_EXPORT_FILE = "topdown_export.json"; // flat name → save dir root

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
    // ── Import the level data. The spawns are copied into an editable working list; the
    //    player spawn cell is pulled out as editable state (the Spawn tool moves it). ────
    const data = LevelSerializer.load(EDITOR_SOURCE_FILE, { genre: "topdown" });
    this._cell = data.cell ?? 32;
    this._sizeIdx = 0; // selected "New" size preset

    // Renderer + camera are built once; _initLevel (re)binds the tilemap pass to whatever
    // level is current, so a New/resize doesn't rebuild the camera or the palette.
    this.renderer = new Renderer();
    this.camera = cameraPan(); // middle-drag pan + wheel zoom; LMB/RMB free for editing
    this.camera.assign(0);

    this._initLevel(data.cols, data.rows, this._cell);
    // Paint loaded wall + floor rects (bulk: layer.set + one syncAll, like
    // TopDownLevel.build; incremental edits in step() go through TileEdit.set/clear).
    this._paintRects(this.wallLayer, data.walls, this.wallType);
    this._paintRects(this.floorLayer, data.floors, this.floorType);
    this.level.syncAll();

    this._spawns = (data.spawns ?? []).slice(); // add/remove entries (no field mutation)
    this._spawnPoint = {
      gx: data.meta.playerSpawn.gx,
      gy: data.meta.playerSpawn.gy,
    };

    this._tool = "wall"; // "wall" | "floor" | "erase" | "spawn" | "entity"
    this._placePreset = TopDownCatalog.entries[0].id; // active entity preset

    this._buildPalette(openScene);

    Log.info(
      `level editor ready — ${this.level.cols}x${this.level.rows}, ` +
        `walls=${(data.walls ?? []).length} spawns=${this._spawns.length}`,
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
      grid: true,
      names: true,
      font: I18n.font("default"),
    });
    this.renderer.insert(this._tilePass);
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
    // overlaps its siblings, so wrap each label in a fixed-height row (as sceneTopDown
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

    // Entities section — one button per catalog preset.
    labelRow(
      I18n.textRef("EDITOR_ENTITIES"),
      { color: GemsTheme.textMuted, font: I18n.font("header") },
      26,
    );
    for (let i = 0; i < TopDownCatalog.entries.length; i++) {
      const entry = TopDownCatalog.entries[i];
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

    card.insertChild(
      gemsButton(I18n.textRef("EDITOR_EXPORT"), () => this._export(), {
        primary: true,
      }),
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
      const e = TopDownCatalog.get(this._placePreset);
      return I18n.text("EDITOR_TOOL", e ? e.label : this._placePreset);
    }
    const key =
      this._tool === "wall"
        ? "EDITOR_WALL"
        : this._tool === "floor"
          ? "EDITOR_FLOOR"
          : this._tool === "spawn"
            ? "EDITOR_SPAWN"
            : "EDITOR_ERASE";
    return I18n.text("EDITOR_TOOL", I18n.text(key));
  }

  step() {
    this.camera.update();

    // Paint guard: skip when the cursor is over the palette panel (GUI space). `width > 0`
    // dodges the first-frame NaN rect.
    const gmx = device_mouse_x_to_gui(0);
    const gmy = device_mouse_y_to_gui(0);
    const p = this._palette.getLayoutPosition();
    if (
      p.width > 0 &&
      gmx >= p.x &&
      gmx <= p.x + p.width &&
      gmy >= p.y &&
      gmy <= p.y + p.height
    )
      return;

    const cell = this.level.worldToGrid(mouse_x, mouse_y);
    if (
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x >= this.level.cols ||
      cell.y >= this.level.rows
    )
      return;

    if (this._tool === "entity") {
      // Entities: place on LMB click, delete the one at the cell on RMB click (edge-
      // triggered — held would spam-place/delete).
      if (mouse_check_button_pressed(mb_left)) {
        this._spawns.push(
          TopDownCatalog.get(this._placePreset).make(cell.x, cell.y),
        );
      } else if (mouse_check_button_pressed(mb_right)) {
        this._deleteSpawnAt(cell.x, cell.y);
      }
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

  // Remove the last-placed spawn occupying (gx, gy), if any.
  _deleteSpawnAt(gx, gy) {
    for (let i = this._spawns.length - 1; i >= 0; i--) {
      if (this._spawns[i].gx === gx && this._spawns[i].gy === gy) {
        this._spawns.splice(i, 1);
        return;
      }
    }
  }

  // Assemble the edited level data and write it out. Walls/floors are re-derived from the
  // painted grids via the greedy mesh; meta carries the edited player spawn; spawns are the
  // edited list.
  _export() {
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

  draw() {
    this.renderer.draw(); // grid + walls (red) + tile labels, under the pan/zoom camera
    this._drawFloors(); // translucent fill so painted floors are visible
    this._drawMarkers(); // entity spawn records as colored boxes + labels
    this._drawSpawn(); // player spawn marker
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
      const e = TopDownCatalog.get(s.preset);
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
