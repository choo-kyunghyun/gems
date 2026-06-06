const PLATF_GRAVITY  = 1200;
const PLATF_MAX_FALL = 900;

SceneRegistry.add(
  () => new _ScenePlatformerClass(),
  { label: I18n.textRef("PLAT_NAME"), category: "SCENE_CAT_ACTION" },
);

class _ScenePlatformerClass extends Scene {
  label = "Platformer";

  create(openScene) {
    this.world = new World(256, 60, { gravity: PLATF_GRAVITY });

    const levelData = PlatformerLevels[0];
    PlatformerLevel.build(this.world, levelData);
    this.ctrl = PlatformerController.create(this.world, levelData.playerSpawn);

    this.physics = new Pipeline()
      .add(GravitySystem)
      .add((world) => {
        const vel = world.get(Velocity, this.ctrl.id);
        if (vel.y > PLATF_MAX_FALL) vel.y = PLATF_MAX_FALL;
      })
      .add(SolidSystem);

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

    this.ui = new UIElement({ width: "100%", height: "100%", padding: 16 });
    UI.insert(this.ui);
    this.ui.insertChild(makeButton(I18n.textRef("PLAT_BACK"), () => openScene(SCENES.lobby)));
  }

  step() {
    const ticks = this.world.update();
    for (let t = 0; t < ticks; t++) {
      PlatformerController.update(this.world, this.ctrl);
      this.physics.update(this.world);
      this.world.flush();
    }
    this.camera.update();
  }

  draw() {
    this.renderer.draw(this.world);
  }

  destroy() {
    PlatformerController.destroy();
    this.camera.destroy();
    this.renderer.destroy();
    this.world.destroy();
    UI.remove(this.ui);
    this.ui.destroy();
  }
}
