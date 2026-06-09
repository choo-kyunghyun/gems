// Layered dual-grid terrain demo — the priority-stack composition of option 1
// built on the dual-grid sampling of option 2.
//
// Each terrain tier (water < sand < grass) is its own TileLayer; tier K is solid
// wherever a cell's height >= K. The three RenderTileMap passes draw bottom-up,
// and because dual-grid tiles leave empty corners transparent, each upper terrain's
// border reveals the one beneath it — RPG-Maker-style cascading transitions with
// only a single 16-frame corner tileset per terrain, no hand-drawn transition art.
//
// spr_tiledual is the project's 16-frame corner tileset: frame N fills exactly the
// corners of mask N (TL=1 TR=2 BR=4 BL=8). Validate that frame order with the
// "듀얼그리드 검사기" (sceneTileInspectDual) scene.

const TERRAIN_CELL = 32;

SceneRegistry.add(() => new _SceneTileTerrainClass(), {
  label: I18n.textRef("TERRAIN_NAME"),
  category: "SCENE_CAT_MAP",
});

class _SceneTileTerrainClass extends Scene {
  label = "TileTerrain";

  create(openScene) {
    this.level = new Level({
      cellWidth: TERRAIN_CELL,
      cellHeight: TERRAIN_CELL,
    });
    const { cols, rows } = this.level;
    this.cols = cols;
    this.rows = rows;

    // Dual rendering only cares about filled vs empty, so one shared token suffices.
    this.fill = new TileType({ id: 1, name: "fill" });

    // One layer per terrain tier (index = priority; 0 = lowest = water base).
    this.layers = [
      new TileLayer(cols, rows, {}),
      new TileLayer(cols, rows, {}),
      new TileLayer(cols, rows, {}),
    ];

    // Height field: 0 water, 1 sand, 2 grass. Seed a concentric island.
    this.h = new Array(cols * rows).fill(0);
    const cx = cols * 0.5;
    const cy = rows * 0.5;
    const rGrass = Math.min(cols, rows) * 0.18;
    const rSand = Math.min(cols, rows) * 0.33;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const d = Math.hypot(x - cx, y - cy);
        let height = 0;
        if (d < rGrass) height = 2;
        else if (d < rSand) height = 1;
        this.h[y * cols + x] = height;
        this._applyCell(x, y);
      }
    }

    const sprite = asset_get_index("spr_tiledual"); // corner tileset (frame = corner mask)
    this.renderer = new Renderer();
    this.passes = [
      new RenderTileMap(this.layers[0], this.level, sprite, {
        autotile: "dual",
        color: Color.rgb(60, 110, 180),
      }),
      new RenderTileMap(this.layers[1], this.level, sprite, {
        autotile: "dual",
        color: Color.rgb(210, 190, 130),
      }),
      new RenderTileMap(this.layers[2], this.level, sprite, {
        autotile: "dual",
        color: Color.rgb(90, 160, 70),
      }),
    ];
    for (let i = 0; i < this.passes.length; i++)
      this.renderer.insert(this.passes[i]);

    this.camera = cameraPan();
    this.camera.assign(0);

    this.ui = new UIElement({
      width: "100%",
      height: "100%",
      padding: 16,
      gap: 8,
    });
    UI.insert(this.ui);
    const hint = new UIElement();
    hint.addComponent(
      new UIText({
        textRef: I18n.textRef("TERRAIN_HINT"),
        color: Color.parse("#cccccc"),
      }),
    );
    this.ui.insertChild(hint);
    this.ui.insertChild(
      makeButton(I18n.textRef("TERRAIN_BACK"), () => openScene(SCENES.lobby)),
    );
  }

  // Sync the three terrain layers at one cell from its height (tier K solid if height >= K).
  _applyCell(x, y) {
    const height = this.h[y * this.cols + x];
    for (let k = 0; k < 3; k++) {
      this.layers[k].set(x, y, height >= k ? this.fill : undefined);
    }
  }

  step() {
    this.camera.update();

    const cell = this.level.worldToGrid(mouse_x, mouse_y);
    if (cell.x < 0 || cell.y < 0 || cell.x >= this.cols || cell.y >= this.rows)
      return;

    const i = cell.y * this.cols + cell.x;
    let changed = false;
    if (mouse_check_button_pressed(mb_left) && this.h[i] < 2) {
      this.h[i]++;
      changed = true;
    } else if (mouse_check_button_pressed(mb_right) && this.h[i] > 0) {
      this.h[i]--;
      changed = true;
    }
    if (changed) {
      this._applyCell(cell.x, cell.y);
      // Dual-grid display tiles read neighbor corners, so a full rebuild is needed.
      for (let k = 0; k < 3; k++) this.passes[k].markDirty();
    }

    Tooltip.set(`(${cell.x}, ${cell.y})  height ${this.h[i]}`);
  }

  draw() {
    this.renderer.draw();
  }

  destroy() {
    this.level.destroy();
    for (let k = 0; k < this.layers.length; k++) this.layers[k].destroy();
    teardownScene(this);
  }
}
