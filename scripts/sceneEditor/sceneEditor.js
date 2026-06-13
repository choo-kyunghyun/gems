// In-engine level editor (Phase 1: tiles + import/export round-trip).
//
// A dedicated authoring Scene — NOT a simulation. It loads a level file, holds the level
// data, renders a grid representation, and lets you paint wall tiles with a pan/zoom
// camera, then exports the edited level back to a JSON file. No World, no physics, no
// gameplay systems: placed geometry is pure data. Modeled on sceneTileTerrain (the
// canonical paint-scene shape: Level + TileLayer + render pass + cameraPan + paint loop).
//
// Export writes via File.write → buffer_save, which targets the SAVE dir
// (%LOCALAPPDATA%/gems/), not the read-only bundled datafiles/. To ship an exported
// level, copy it into datafiles/levels/ and register it in IncludedFiles.

const EDITOR_SOURCE_FILE = "levels/topdown_1.json"; // level loaded for editing (v1)
const EDITOR_EXPORT_FILE = "topdown_export.json"; // flat name → save dir root

SceneRegistry.add(() => new _SceneEditorClass(), {
  label: I18n.textRef("EDITOR_NAME"),
  category: "SCENE_CAT_MAP",
});

class _SceneEditorClass extends Scene {
  label = "Editor";

  create(openScene) {
    // ── Load the level data (import). Kept on `this` so unedited fields (meta, spawns)
    //    round-trip on export. ────────────────────────────────────────────────────────
    const data = LevelSerializer.load(EDITOR_SOURCE_FILE, { genre: "topdown" });
    this._data = data;

    const cell = data.cell ?? 32;
    this.level = new Level({
      cellWidth: cell,
      cellHeight: cell,
      cols: data.cols,
      rows: data.rows,
    });
    this.wallType = new TileType({ id: 1, name: "벽", pathCost: null });
    this.floorType = new TileType({ id: 2, name: "바닥" });
    // Floor layer kept (empty in v1) so the level structure matches the game and is ready
    // for the floor brush in a later phase; only the wall layer is painted/exported now.
    this.floorLayer = new TileLayer(this.level.cols, this.level.rows, {
      emptyCost: 1,
    });
    this.wallLayer = new TileLayer(this.level.cols, this.level.rows);
    this.level.insert(this.floorLayer);
    this.level.insert(this.wallLayer);

    // Paint the loaded wall rects into the wall layer (bulk: layer.set + one syncAll, like
    // TopDownLevel.build; incremental edits in step() go through TileEdit.set/clear).
    const rects = data.walls ?? [];
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      for (let y = r[1]; y < r[1] + r[3]; y++)
        for (let x = r[0]; x < r[0] + r[2]; x++)
          this.wallLayer.set(x, y, this.wallType);
    }
    this.level.syncAll();

    // ── Render: grid + tile labels (the editing view). RenderDebugTileMap reads the level
    //    live each frame, so edits show immediately (no markDirty / no VBO). ─────────────
    this.renderer = new Renderer();
    this.renderer.insert(
      new RenderDebugTileMap(this.level, {
        grid: true,
        names: true,
        font: I18n.font("default"),
      }),
    );

    // Pan (middle-drag) + zoom (wheel); LMB/RMB stay free for painting.
    this.camera = cameraPan();
    this.camera.assign(0);

    this._brush = "wall"; // "wall" | "erase"

    // ── Palette UI: absolute top-left card (its rect is the paint-guard hit test). ──────
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
      gemsButton(
        () =>
          I18n.text(this._brush === "wall" ? "EDITOR_WALL" : "EDITOR_ERASE"),
        () => {
          this._brush = this._brush === "wall" ? "erase" : "wall";
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

    Log.info(
      `level editor ready — ${this.level.cols}x${this.level.rows}, walls=${rects.length}`,
    );
  }

  step() {
    this.camera.update();

    // Paint guard: skip when the cursor is over the palette panel (GUI space), so clicking
    // a button doesn't also paint underneath. `width > 0` dodges the first-frame NaN rect.
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

    // LMB applies the current brush (drag-paint while held); RMB is an erase shortcut.
    if (mouse_check_button(mb_left)) {
      if (this._brush === "wall")
        TileEdit.set(this.level, this.wallLayer, cell.x, cell.y, this.wallType);
      else TileEdit.clear(this.level, this.wallLayer, cell.x, cell.y);
    } else if (mouse_check_button(mb_right)) {
      TileEdit.clear(this.level, this.wallLayer, cell.x, cell.y);
    }

    Tooltip.set(`(${cell.x}, ${cell.y})`);
  }

  // Assemble the level data from editor state and write it out. Walls are re-derived from
  // the painted grid via the greedy mesh; meta/spawns carry over unchanged so entities
  // survive the round-trip (v1 doesn't edit them).
  _export() {
    const data = {
      version: 1,
      genre: "topdown",
      cell: this.level.cellWidth,
      cols: this.level.cols,
      rows: this.level.rows,
      meta: this._data.meta,
      walls: TileEdit.meshRects(this.level, this.wallLayer),
      layers: [],
      spawns: this._data.spawns,
    };
    const ok = LevelSerializer.save(EDITOR_EXPORT_FILE, data);
    Toast.push(I18n.text("EDITOR_SAVED", EDITOR_EXPORT_FILE), {
      type: ok ? "success" : "error",
    });
    Log.info(
      `editor export ${ok ? "ok" : "FAILED"} → ${EDITOR_EXPORT_FILE} walls=${data.walls.length}`,
    );
  }

  draw() {
    this.renderer.draw(); // world-space tile grid, under the pan/zoom camera
  }

  destroy() {
    this.level.destroy(); // also destroys its inserted wall/floor layers
    teardownScene(this);
  }
}
