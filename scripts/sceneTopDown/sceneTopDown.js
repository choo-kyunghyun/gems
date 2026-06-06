SceneRegistry.add(() => new _SceneTopDownClass(), {
  label: I18n.textRef("TOPDOWN_NAME"),
  category: "SCENE_CAT_RPG",
});

class _SceneTopDownClass extends Scene {
  label = "TopDown";

  create(openScene) {
    this.world = new World(256, 60);

    const built = TopDownLevel.build(this.world, TopDownLevels[0]);
    this.level = built.level;
    this.ctrl = TopDownController.create(this.world, built.spawn);

    // Shooting-gallery targets: solid obstacles with Health that bullets damage.
    this.enemies = [];
    const enemyCells = [
      [8, 3],
      [14, 3],
      [3, 11],
      [17, 11],
    ];
    for (let i = 0; i < enemyCells.length; i++) {
      const wpt = this.level.gridToWorld(enemyCells[i][0], enemyCells[i][1]);
      const id = this.world.create();
      this.world.add(id, Position, { x: wpt.x, y: wpt.y, z: 0 });
      this.world.add(id, BBox, { x: -12, y: -12, width: 24, height: 24 });
      this.world.add(id, Collision, {
        solid: true,
        kinematic: true,
        mask: null,
        hits: [],
      });
      this.world.add(id, Health, { hp: 3 });
      this.world.add(id, Tag, { tags: new Set(["enemy"]) });
      this.world.add(id, Name, { name: "Enemy" });
      this.enemies.push(id);
    }

    this.physics = new Pipeline()
      .add(SolidSystem)
      .add(ProjectileSystem)
      .add(LifetimeSystem); // despawns bullets at max range

    this.renderer = new Renderer();
    this.renderer.insert(new RenderDebugEntity());

    this.camera = cameraFollow2d({
      world: this.world,
      followTarget: this.ctrl.id,
      followLerp: 0.15,
      width: surface_get_width(application_surface),
      height: surface_get_height(application_surface),
    });
    this.camera.assign(0);

    this.ui = new UIElement({
      width: "100%",
      height: "100%",
      padding: 16,
      gap: 12,
    });
    UI.insert(this.ui);
    this.ui.insertChild(
      makeButton(I18n.textRef("TOPDOWN_BACK"), () => openScene(SCENES.lobby)),
    );
    const hint = new UIElement();
    hint.addComponent(
      new UIText({
        textRef: I18n.textRef("TOPDOWN_HINT"),
        color: Color.parse("#888888"),
      }),
    );
    this.ui.insertChild(hint);
  }

  step() {
    const ticks = this.world.update();
    for (let t = 0; t < ticks; t++) {
      InterpolationSystem.snapshot(this.world); // record pre-move positions for render lerp
      TopDownController.update(this.world, this.ctrl);
      this.physics.update(this.world);
      this.world.flush();
    }
    this.camera.update();
  }

  draw() {
    this.renderer.draw(this.world);

    // Player marker (no sprite yet — filled box keeps it distinct from tiles).
    // Interpolated to match the renderer's PrevPosition + alpha lerp.
    const pos = this.world.get(Position, this.ctrl.id);
    const prev = this.world.get(PrevPosition, this.ctrl.id);
    const a = this.world.alpha;
    const rx = prev !== undefined ? prev.x + (pos.x - prev.x) * a : pos.x;
    const ry = prev !== undefined ? prev.y + (pos.y - prev.y) * a : pos.y;
    draw_set_color(c_red);
    draw_rectangle(rx - 12, ry - 12, rx + 12, ry + 12, false);
    draw_set_color(c_white);
  }

  destroy() {
    TopDownController.destroy();
    this.camera.destroy();
    this.renderer.destroy();
    this.level.destroy();
    this.world.destroy();
    UI.remove(this.ui);
    this.ui.destroy();
  }
}
