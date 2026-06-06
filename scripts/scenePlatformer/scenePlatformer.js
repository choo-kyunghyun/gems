const PLATF_GRAVITY = 1200;
const PLATF_MAX_FALL = 900;
const PLATF_DEATH_Y = 900; // fall past this (off a platform edge into the void) → respawn

SceneRegistry.add(() => new _ScenePlatformerClass(), {
  label: I18n.textRef("PLAT_NAME"),
  category: "SCENE_CAT_ACTION",
});

class _ScenePlatformerClass extends Scene {
  label = "Platformer";

  create(openScene) {
    this.world = new World(256, 60, { gravity: PLATF_GRAVITY });

    const levelData = PlatformerLevels[0];
    this.spawn = levelData.playerSpawn;
    PlatformerLevel.build(this.world, levelData);
    this.ctrl = PlatformerController.create(this.world, levelData.playerSpawn);

    this.score = 0;
    this.totalCoins = (levelData.coins ?? []).length;
    this.won = false;

    this.physics = new Pipeline()
      .add(GravitySystem)
      .add((world) => {
        const vel = world.get(Velocity, this.ctrl.id);
        if (vel.y > PLATF_MAX_FALL) vel.y = PLATF_MAX_FALL;
      })
      .add(SolidSystem)
      .add(TriggerSystem); // fills col.hits so coins/goal can be collected

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
      makeButton(I18n.textRef("PLAT_BACK"), () => openScene(SCENES.lobby)),
    );

    const coins = new UIElement();
    coins.addComponent(
      new UIText({
        textRef: I18n.textRef(
          "PLAT_COINS",
          () => this.score,
          () => this.totalCoins,
        ),
        color: Color.parse("#ffd700"),
      }),
    );
    this.ui.insertChild(coins);

    const win = new UIElement();
    win.addComponent(
      new UIText({
        textRef: () => (this.won ? I18n.text("PLAT_WIN") : ""),
        color: Color.parse("#7cfc00"),
      }),
    );
    this.ui.insertChild(win);
  }

  step() {
    if (this.won) return; // level cleared — freeze the simulation

    PlatformerController.pollInput(this.ctrl); // sample jump edges once per frame
    const ticks = this.world.update();
    for (let t = 0; t < ticks; t++) {
      InterpolationSystem.snapshot(this.world); // record pre-move positions for render lerp
      PlatformerController.update(this.world, this.ctrl);
      this.physics.update(this.world);
      EnemySystem.update(this.world); // patrol/turn (after SolidSystem)

      let dead = EnemySystem.resolveStomp(this.world, this.ctrl.id);
      if (!dead && this.world.get(Position, this.ctrl.id).y > PLATF_DEATH_Y)
        dead = true;
      if (dead) {
        PlatformerController.respawn(this.world, this.ctrl, this.spawn);
      } else {
        this.score += CollectibleSystem.collect(this.world, this.ctrl.id);
        if (CollectibleSystem.reachedGoal(this.world, this.ctrl.id))
          this.won = true;
      }

      this.world.flush();
      if (this.won) break;
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
