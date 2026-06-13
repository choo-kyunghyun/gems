// Example scene — inspect tile-grid structure with RenderDebugTileMap.
//
// Builds a Level (auto-fit to the room) holding one TileLayer of walls plus a
// mud patch, syncs the pathfinding grid, and renders the debug overlay. Left
// click paints walls, right click clears them; the nav grid re-syncs live so
// the cost shading updates immediately. A tooltip reports the hovered cell.
//
// Demonstrates: Level / TileLayer / TileType / RenderDebugTileMap.

const TILEMAP_CELL = 48;

SceneRegistry.add(() => new _SceneTileMapClass(), {
  label: I18n.textRef("TILEMAP_NAME"),
  category: "SCENE_CAT_MAP",
});

class _SceneTileMapClass extends Scene {
  label = "TileMap";

  create(openScene) {
    // Tile palette: a blocking wall (pathCost null → Infinity) and costly mud.
    this.wall = new TileType({ id: 1, name: "벽", pathCost: null });
    this.mud = new TileType({ id: 2, name: "진흙", pathCost: 5 });

    // Level derives cols/rows from the room size and the cell size.
    this.level = new Level({
      cellWidth: TILEMAP_CELL,
      cellHeight: TILEMAP_CELL,
    });

    // Single base layer. emptyCost:1 makes untiled cells walkable floor;
    // placed tiles carry their TileType.pathCost into the nav grid on sync.
    this.layer = new TileLayer(this.level.cols, this.level.rows, {
      emptyCost: 1,
    });
    this.level.insert(this.layer);

    const { cols, rows } = this.level;

    // Border walls.
    for (let x = 0; x < cols; x++) {
      this.layer.set(x, 0, this.wall);
      this.layer.set(x, rows - 1, this.wall);
    }
    for (let y = 0; y < rows; y++) {
      this.layer.set(0, y, this.wall);
      this.layer.set(cols - 1, y, this.wall);
    }

    // An interior wall and a mud patch so shading shows both cost states.
    const mid = Math.floor(cols * 0.5);
    for (let y = 2; y < rows - 3; y++) this.layer.set(mid, y, this.wall);
    for (let y = 2; y < Math.min(6, rows - 1); y++) {
      for (let x = 2; x < Math.min(7, cols - 1); x++)
        this.layer.set(x, y, this.mud);
    }

    // Compute nav costs into level.mpg (drives the debug cost shading).
    this.level.syncAll();

    this.renderer = new Renderer();
    this.tilePass = new RenderTileMap(
      this.layer,
      this.level,
      asset_get_index("spr_tile47"),
      { autotile: 47 },
    );
    this.renderer.insert(this.tilePass);
    // Debug overlay on top — labels with the smaller localized font so ids fit cells.
    this.renderer.insert(
      new RenderDebugTileMap(this.level, {
        names: true,
        font: I18n.font("default"),
      }),
    );
    this.renderer.insert(new RenderGrid(this.level)); // cell boundary lines

    // UI: hint line + back button.
    this.ui = gemsRoot({ gap: GemsTheme.gapSm });
    UI.insert(this.ui);
    this.ui.insertChild(gemsHint(I18n.textRef("TILEMAP_HINT")));
    this.ui.insertChild(
      gemsButton(I18n.textRef("TILEMAP_BACK"), () => openScene(SCENES.lobby)),
    );
  }

  step() {
    const level = this.level;
    const cell = level.worldToGrid(mouse_x, mouse_y);
    if (
      cell.x < 0 ||
      cell.y < 0 ||
      cell.x >= level.cols ||
      cell.y >= level.rows
    )
      return;

    // Paint / clear walls and re-sync just the touched cell.
    if (mouse_check_button(mb_left)) {
      this.layer.set(cell.x, cell.y, this.wall);
      level.syncAt(cell.x, cell.y);
      this.tilePass.markDirty();
    } else if (mouse_check_button(mb_right)) {
      this.layer.set(cell.x, cell.y, undefined);
      level.syncAt(cell.x, cell.y);
      this.tilePass.markDirty();
    }

    // Report the hovered cell's structure.
    const tile = this.layer.get(cell.x, cell.y);
    const cost = level.mpg.get(cell.x, cell.y);
    Tooltip.set(
      `(${cell.x}, ${cell.y})  ${tile ? tile.name : "—"}  cost ${cost === Infinity ? "∞" : cost}`,
    );
  }

  draw() {
    this.renderer.draw();
  }

  destroy() {
    this.level.destroy();
    teardownScene(this);
  }
}
