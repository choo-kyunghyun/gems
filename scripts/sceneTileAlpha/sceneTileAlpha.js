// TileMap alpha-blending demo — the per-pass `alpha` and `softEdge` knobs of
// RenderTileMap, shown over an opaque base field (cf. sceneTileTerrain, which
// stacks dual-grid passes for terrain transitions).
//
// Two per-cell passes: a solid spr_grass base field, and a spr_sand overlay
// blob you paint on top. The slider drives the overlay pass `alpha` (uniform
// translucency — grass bleeds through the sand); the toggle flips `softEdge`,
// which fades each overlay tile's border into the grass via per-vertex alpha.
// softEdge owns the corner alpha, so it ignores the slider.

const TILEALPHA_CELL = 32;

SceneRegistry.add(() => new _SceneTileAlphaClass(), {
  label: I18n.textRef("TILEALPHA_NAME"),
  category: "SCENE_CAT_MAP",
});

class _SceneTileAlphaClass extends Scene {
  label = "TileAlpha";

  create(openScene) {
    this.level = new Level({
      cellWidth: TILEALPHA_CELL,
      cellHeight: TILEALPHA_CELL,
    });
    const { cols, rows } = this.level;
    this.cols = cols;
    this.rows = rows;

    // Per-cell mode keys the frame off TileType.id; spr_grass/spr_sand are
    // single-frame textures, so id 0 (the only frame) tiles each across the cell.
    this.fill = new TileType({ id: 0, name: "fill" });

    // Base: opaque grass field. Overlay: the sand blob we blend on top.
    this.base = new TileLayer(cols, rows, {});
    this.overlay = new TileLayer(cols, rows, {});
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) this.base.set(x, y, this.fill);
    }

    // Seed the overlay with a centered disc so there are edges to blend.
    const cx = cols * 0.5;
    const cy = rows * 0.5;
    const r = Math.min(cols, rows) * 0.28;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (Math.hypot(x - cx, y - cy) < r) this.overlay.set(x, y, this.fill);
      }
    }

    this.alpha = 0.6;
    this.softEdge = false;

    this.renderer = new Renderer();
    this.basePass = new RenderTileMap(
      this.base,
      this.level,
      asset_get_index("spr_grass"),
    );
    this.overlayPass = new RenderTileMap(
      this.overlay,
      this.level,
      asset_get_index("spr_sand"),
      { alpha: this.alpha, softEdge: this.softEdge },
    );
    this.renderer.insert(this.basePass);
    this.renderer.insert(this.overlayPass);

    this.camera = cameraPan();
    this.camera.assign(0);

    this.ui = gemsRoot({ gap: GemsTheme.gapSm });
    UI.insert(this.ui);

    this.ui.insertChild(
      gemsLabel(I18n.textRef("TILEALPHA_HINT"), { color: "#cccccc" }),
    );

    const panel = gemsSection(I18n.textRef("TILEALPHA_NAME"));

    // Not Settings-bound (drives the overlay pass live), so build UISlider directly
    // but with the gems theme colors to match gemsSlider's look.
    const slider = new UIElement({ height: 24, width: "100%" });
    slider.addComponent(
      new UISlider({
        min: 0,
        max: 1,
        value: this.alpha,
        onChange: (v) => {
          this.alpha = v;
          this.overlayPass.alpha = v;
          this.overlayPass.markDirty(); // alpha is baked into the VBO
        },
        track: { color: gemsColor(GemsTheme.btnPress), rad: 6 },
        fill: { color: gemsColor(GemsTheme.accent), rad: 6 },
        thumb: { color: gemsColor(GemsTheme.text), rad: 8 },
      }),
    );
    panel.insertChild(gemsRow(I18n.textRef("TILEALPHA_ALPHA"), slider));

    panel.insertChild(
      gemsToggle(
        I18n.textRef("TILEALPHA_SOFT"),
        () => this.softEdge,
        () => {
          this.softEdge = !this.softEdge;
          this.overlayPass.softEdge = this.softEdge;
          this.overlayPass.markDirty();
        },
        {
          onText: I18n.textRef("TILEALPHA_ON"),
          offText: I18n.textRef("TILEALPHA_OFF"),
        },
      ),
    );
    this.ui.insertChild(panel);

    this.ui.insertChild(
      gemsButton(I18n.textRef("TILEALPHA_BACK"), () => openScene(SCENES.lobby)),
    );
  }

  step() {
    this.camera.update();

    const cell = this.level.worldToGrid(mouse_x, mouse_y);
    if (cell.x < 0 || cell.y < 0 || cell.x >= this.cols || cell.y >= this.rows)
      return;

    let changed = false;
    if (mouse_check_button(mb_left) && !this.overlay.get(cell.x, cell.y)) {
      this.overlay.set(cell.x, cell.y, this.fill);
      changed = true;
    } else if (
      mouse_check_button(mb_right) &&
      this.overlay.get(cell.x, cell.y)
    ) {
      this.overlay.set(cell.x, cell.y, undefined);
      changed = true;
    }
    // Autotile + softEdge read neighbors, so a painted cell dirties the overlay.
    if (changed) this.overlayPass.markDirty();

    Tooltip.set(`(${cell.x}, ${cell.y})`);
  }

  draw() {
    this.renderer.draw();
  }

  destroy() {
    this.level.destroy();
    this.base.destroy();
    this.overlay.destroy();
    teardownScene(this);
  }
}
