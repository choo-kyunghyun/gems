// In-engine level editor (Phase 2: tiles + floors + entity placement + import/export).
//
// A dedicated authoring Scene — NOT a simulation. It loads a level file, holds the level
// data, renders a grid representation with a pan/zoom camera, and lets you paint wall/floor
// tiles and place/delete entities, then exports the edited level back to a JSON file. No
// World, no physics, no gameplay systems: everything placed is pure data (entities are
// `spawns` records drawn as markers, not live AI entities). Modeled on sceneTileTerrain.
//
// Tools (a flat "categorized" palette, no tab show/hide): the Tiles section selects a
// wall/floor/erase brush (LMB drag-paints, RMB erases both layers); the Entities section
// selects a TopDownCatalog preset (LMB places one at the cell, RMB deletes the one there).
//
// Export writes via File.write → buffer_save, which targets the SAVE dir
// (%LOCALAPPDATA%/gems/), not the read-only bundled datafiles/. To ship an exported
// level, copy it into datafiles/levels/ and register it in IncludedFiles.

const EDITOR_SOURCE_FILE = "levels/topdown_1.json"; // level loaded for editing
const EDITOR_EXPORT_FILE = "topdown_export.json"; // flat name → save dir root

SceneRegistry.add(() => new _SceneEditorClass(), {
  label: I18n.textRef("EDITOR_NAME"),
  category: "SCENE_CAT_MAP",
});

class _SceneEditorClass extends Scene {
  label = "Editor";

  create(openScene) {
    // ── Import the level data. Kept on `this` so unedited fields (meta) round-trip; the
    //    spawns are copied into an editable working list. ──────────────────────────────
    const data = LevelSerializer.load(EDITOR_SOURCE_FILE, { genre: "topdown" });
    this._data = data;
    this._spawns = (data.spawns ?? []).slice(); // add/remove entries (no field mutation)

    const cell = data.cell ?? 32;
    this.level = new Level({
      cellWidth: cell,
      cellHeight: cell,
      cols: data.cols,
      rows: data.rows,
    });
    this.wallType = new TileType({ id: 1, name: "벽", pathCost: null });
    this.floorType = new TileType({ id: 2, name: "바닥" });
    this.floorLayer = new TileLayer(this.level.cols, this.level.rows, {
      emptyCost: 1,
    });
    this.wallLayer = new TileLayer(this.level.cols, this.level.rows);
    this.level.insert(this.floorLayer);
    this.level.insert(this.wallLayer);

    // Paint loaded wall + floor rects (bulk: layer.set + one syncAll, like
    // TopDownLevel.build; incremental edits in step() go through TileEdit.set/clear).
    this._paintRects(this.wallLayer, data.walls, this.wallType);
    this._paintRects(this.floorLayer, data.floors, this.floorType);
    this.level.syncAll();

    // RenderDebugTileMap reads the level live each frame (no VBO), so edits show at once.
    // It shades walls red (cost ∞) but not floors (cost 1) — the editor fills floor cells
    // itself in draw() so they're visible.
    this.renderer = new Renderer();
    this.renderer.insert(
      new RenderDebugTileMap(this.level, {
        grid: true,
        names: true,
        font: I18n.font("default"),
      }),
    );

    this.camera = cameraPan(); // middle-drag pan + wheel zoom; LMB/RMB free for editing
    this.camera.assign(0);

    this._tool = "wall"; // "wall" | "floor" | "erase" | "entity"
    this._placePreset = TopDownCatalog.entries[0].id; // active entity preset

    this._buildPalette(openScene);

    Log.info(
      `level editor ready — ${this.level.cols}x${this.level.rows}, ` +
        `walls=${(data.walls ?? []).length} spawns=${this._spawns.length}`,
    );
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
    card.insertChild(
      gemsLabel(I18n.textRef("EDITOR_HINT"), { color: GemsTheme.textMuted }),
    );
    card.insertChild(
      gemsLabel(() => this._toolStatus(), { color: GemsTheme.accent }),
    );

    // Tiles section.
    card.insertChild(
      gemsLabel(I18n.textRef("EDITOR_TILES"), {
        color: GemsTheme.textMuted,
        font: I18n.font("header"),
      }),
    );
    const tile = (key, tool) =>
      card.insertChild(
        gemsButton(I18n.textRef(key), () => {
          this._tool = tool;
        }),
      );
    tile("EDITOR_WALL", "wall");
    tile("EDITOR_FLOOR", "floor");
    tile("EDITOR_ERASE", "erase");

    // Entities section — one button per catalog preset.
    card.insertChild(
      gemsLabel(I18n.textRef("EDITOR_ENTITIES"), {
        color: GemsTheme.textMuted,
        font: I18n.font("header"),
      }),
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
  // painted grids via the greedy mesh; meta carries over; spawns are the edited list.
  _export() {
    const data = {
      version: 1,
      genre: "topdown",
      cell: this.level.cellWidth,
      cols: this.level.cols,
      rows: this.level.rows,
      meta: this._data.meta,
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
        `walls=${data.walls.length} floors=${data.floors.length} spawns=${data.spawns.length}`,
    );
  }

  draw() {
    this.renderer.draw(); // grid + walls (red) + tile labels, under the pan/zoom camera
    this._drawFloors(); // translucent fill so painted floors are visible
    this._drawMarkers(); // entity spawn records as colored boxes + labels
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

  destroy() {
    this.level.destroy(); // also destroys its inserted wall/floor layers
    teardownScene(this);
  }
}
